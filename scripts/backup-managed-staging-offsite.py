#!/usr/bin/env python3
"""Encrypted DB-only offsite export from the *managed* Solange staging source.

This is NOT a clinical-recovery certificate. Storage object bytes and external
keys require separate custody/restore evidence. No schedule or extra writer.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import uuid
from urllib.parse import urlsplit

REF_RE = re.compile(r"[a-z0-9]{20}\Z")
POOLER_RE = re.compile(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com\Z")
FPR_RE = re.compile(r"[A-Fa-f0-9]{40}\Z")
BUCKET_RE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}\Z")
NAMESPACE_RE = re.compile(r"[a-zA-Z0-9._-]{3,64}\Z")
BACKUP_SCOPE_VERDICT = "DB_ONLY_STORAGE_NOT_BACKED_UP"
DEFAULT_OCI = "/home/ubuntu/.venvs/oci-cli/bin/oci"


class BackupBlocked(Exception):
    """Safe-to-print failure reason, never including secrets or provider text."""


def validate_config(env):
    stage = env.get("SUPABASE_STAGING_PROJECT_REF", "")
    prod = env.get("SUPABASE_PRODUCTION_PROJECT_REF", "")
    if not REF_RE.fullmatch(stage) or not REF_RE.fullmatch(prod) or stage == prod:
        raise BackupBlocked("project_isolation_invalid")
    try:
        url = urlsplit(env.get("NEXT_PUBLIC_SUPABASE_URL", ""))
        if (url.scheme != "https" or url.netloc != f"{stage}.supabase.co"
                or url.path not in ("", "/") or url.query or url.fragment
                or url.username or url.password):
            raise ValueError()
    except ValueError:
        raise BackupBlocked("runtime_project_identity_mismatch") from None
    host = env.get("SUPABASE_MANAGED_DB_HOST", "")
    user = env.get("SUPABASE_MANAGED_DB_USER", "")
    direct = host == f"db.{stage}.supabase.co"
    pooler = bool(POOLER_RE.fullmatch(host))
    if not (direct or pooler):
        raise BackupBlocked("database_identity_mismatch")
    if user != ("postgres" if direct else f"postgres.{stage}"):
        raise BackupBlocked("database_identity_mismatch")
    if env.get("SUPABASE_MANAGED_DB_PORT", "") != "5432":
        raise BackupBlocked("database_session_port_invalid")
    fingerprint = env.get("SOLANGE_BACKUP_GPG_RECIPIENT", "")
    if not FPR_RE.fullmatch(fingerprint):
        raise BackupBlocked("offline_encryption_recipient_unavailable")
    bucket = env.get("SOLANGE_BACKUP_OCI_BUCKET", "")
    namespace = env.get("SOLANGE_BACKUP_OCI_NAMESPACE", "")
    if not BUCKET_RE.fullmatch(bucket) or not NAMESPACE_RE.fullmatch(namespace):
        raise BackupBlocked("oci_backup_destination_invalid")
    return {
        "source_ref": stage,
        "db_host": host,
        "db_user": user,
        "db_port": "5432",
        "gpg_fpr": fingerprint.upper(),
        "oci_bucket": bucket,
        "oci_namespace": namespace,
        "oci_binary": env.get("SOLANGE_OCI_CLI_BIN", DEFAULT_OCI),
        "pg_dump_binary": env.get("SOLANGE_PGDUMP17_BIN", "/usr/lib/postgresql/17/bin/pg_dump"),
    }


def require_owner_grant(env, cfg=None, *, grant_path=None, now=None):
    if env.get("SOLANGE_MANAGED_BACKUP_OWNER_GRANT") != "scoped-191-v1":
        raise BackupBlocked("owner_write_grant_missing")
    if cfg is None:
        cfg = validate_config(env)
    if grant_path is None:
        grant_path = (Path(__file__).resolve().parents[1] / "security" /
                      "owner-approvals" / "managed-staging-backup-191.json")
    path = Path(grant_path)
    if not path.is_file() or path.is_symlink():
        raise BackupBlocked("owner_approved_grant_file_missing")
    def unique_pairs(pairs):
        result = {}
        for k, v in pairs:
            if k in result:
                raise ValueError("duplicate grant key")
            result[k] = v
        return result
    try:
        payload = json.loads(path.read_text(), object_pairs_hook=unique_pairs)
        if not isinstance(payload, dict):
            raise ValueError()
        expires = dt.datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00"))
    except (ValueError, KeyError, TypeError, OSError):
        raise BackupBlocked("owner_approved_grant_invalid") from None
    current = dt.datetime.now(dt.timezone.utc) if now is None else now
    if (payload.get("approved_by") != "shopvivaliz-human"
            or payload.get("action") != "managed_staging_db_encrypted_offsite"
            or payload.get("source_ref") != cfg["source_ref"]
            or payload.get("oci_bucket") != cfg["oci_bucket"]
            or payload.get("gpg_fpr") != cfg["gpg_fpr"]
            or payload.get("scope") != BACKUP_SCOPE_VERDICT
            or expires.tzinfo is None or not current < expires <= current + dt.timedelta(days=7)):
        raise BackupBlocked("owner_approved_grant_scope_or_expiry_invalid")


def pg_dump_major(version):
    match = re.search(r"pg_dump \(PostgreSQL\) (\d+)\.", version)
    if not match:
        raise BackupBlocked("pg_dump_version_unverified")
    return int(match.group(1))


def require_pg17(version):
    if pg_dump_major(version) != 17:
        raise BackupBlocked("pg_dump_major_mismatch")


def require_private_oci_bucket(data):
    if (not isinstance(data, dict)
            or data.get("public-access-type") != "NoPublicAccess"):
        raise BackupBlocked("oci_bucket_not_private")


def make_pg_dump_command(cfg, binary):
    return [
        binary, "-h", cfg["db_host"], "-p", cfg["db_port"],
        "-U", cfg["db_user"], "-d", "postgres",
        "--format=custom", "--no-owner", "--no-acl",
        "--schema=public", "--schema=clinical",
        "--schema=auth", "--schema=storage",
    ]


def object_key(ref, when, nonce):
    if not REF_RE.fullmatch(ref) or not re.fullmatch(r"\d{8}T\d{6}Z", when):
        raise BackupBlocked("object_identity_invalid")
    if not re.fullmatch(r"[a-f0-9]{32}", nonce):
        raise BackupBlocked("object_nonce_invalid")
    return f"managed-solange-staging/{ref}/{when}-{nonce}.dump.gpg"


def _run_command(args, *, env=None, want_stdout=False):
    try:
        result = subprocess.run(
            args, env=env, check=False, timeout=60,
            stdout=subprocess.PIPE if want_stdout else subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise BackupBlocked("external_preflight_or_io_failed") from None
    if result.returncode != 0:
        raise BackupBlocked("external_preflight_or_io_failed")
    return result.stdout if want_stdout else b""


def ensure_preflight(cfg):
    binary = cfg["pg_dump_binary"]
    version = _run_command([binary, "--version"], want_stdout=True).decode("ascii", "replace")
    require_pg17(version)
    gpg_output = _run_command(
        ["gpg", "--batch", "--with-colons", "--fingerprint",
         "--list-keys", cfg["gpg_fpr"]], want_stdout=True,
    ).decode("utf8", "replace")
    fingerprints = [
        line.split(":")[9].upper()
        for line in gpg_output.splitlines()
        if line.startswith("fpr:") and len(line.split(":")) > 9
    ]
    if cfg["gpg_fpr"] not in fingerprints:
        raise BackupBlocked("offline_encryption_recipient_unavailable")
    # Independent key custody: no matching secret/private key may be present
    # on the export runner. This is a fail-closed preflight before DB access.
    secret_listing = _run_command(
        ["gpg", "--batch", "--with-colons", "--fingerprint",
         "--list-secret-keys", cfg["gpg_fpr"]], want_stdout=True,
    ).decode("utf8", "replace")
    if any(line.startswith(("sec:", "ssb:", "fpr:"))
           for line in secret_listing.splitlines()):
        raise BackupBlocked("offline_private_key_present_on_runner")
    oci = cfg["oci_binary"]
    bucket_raw = _run_command([
        oci, "os", "bucket", "get", "--auth", "instance_principal",
        "--namespace-name", cfg["oci_namespace"],
        "--bucket-name", cfg["oci_bucket"], "--output", "json",
    ], want_stdout=True)
    try:
        require_private_oci_bucket(json.loads(bucket_raw)["data"])
    except (ValueError, KeyError, TypeError):
        raise BackupBlocked("oci_bucket_unverified") from None
    return cfg


def _safe_private_dir():
    state = Path.home() / ".local" / "state" / "solange-managed-backup"
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    st = state.lstat()
    if (not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid()
            or stat.S_IMODE(st.st_mode) != 0o700):
        raise BackupBlocked("unsafe_backup_state_directory")
    return state


def _checksum(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def execute_encrypted_export(cfg, env):
    """Does not persist unencrypted DB bytes or private key on disk."""
    require_owner_grant(env)
    if not env.get("SUPABASE_DB_PASSWORD"):
        raise BackupBlocked("source_db_password_not_injected")
    ensure_preflight(cfg)
    state = _safe_private_dir()
    lock_path = state / (cfg["source_ref"] + ".lock")
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(lock_path, flags, 0o600)
    try:
        st = os.fstat(fd)
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or stat.S_IMODE(st.st_mode) != 0o600):
            raise BackupBlocked("unsafe_backup_lock")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BackupBlocked("backup_writer_already_running") from None
        with tempfile.TemporaryDirectory(prefix="encrypted-", dir=state) as tmp:
            path = Path(tmp)
            archive = path / "staging.dump.gpg"
            pg_env = os.environ.copy()
            pg_env["PGPASSWORD"] = env["SUPABASE_DB_PASSWORD"]
            pg_env["PGSSLMODE"] = "verify-full"
            pg_env["PGSSLROOTCERT"] = "system"
            pg_env["PGCONNECT_TIMEOUT"] = "10"
            try:
                with open(archive, "wb") as output:
                    os.fchmod(output.fileno(), 0o600)
                    dump = subprocess.Popen(
                        make_pg_dump_command(cfg, cfg["pg_dump_binary"]),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL,
                        env=pg_env,
                    )
                    encrypt = None
                    try:
                        encrypt = subprocess.Popen(
                            ["gpg", "--batch", "--yes", "--trust-model", "always",
                             "--recipient", cfg["gpg_fpr"], "--encrypt"],
                            stdin=dump.stdout,
                            stdout=output,
                            stderr=subprocess.DEVNULL,
                        )
                        dump.stdout.close()
                        enc_rc = encrypt.wait(timeout=600)
                        dump_rc = dump.wait(timeout=600)
                    finally:
                        if encrypt is not None and encrypt.poll() is None:
                            encrypt.kill()
                            encrypt.wait(timeout=5)
                        if dump.poll() is None:
                            dump.kill()
                            dump.wait(timeout=5)
                    if dump_rc or enc_rc:
                        raise BackupBlocked("source_export_or_encryption_failed")
                    output.flush()
                    os.fsync(output.fileno())
            except (OSError, subprocess.TimeoutExpired):
                raise BackupBlocked("source_export_or_encryption_failed") from None
            if not archive.is_file() or archive.stat().st_size < 1024:
                raise BackupBlocked("encrypted_archive_missing_or_too_small")
            archive_sha = _checksum(archive)
            now = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            key = object_key(cfg["source_ref"], now, uuid.uuid4().hex)
            obj_args = [
                cfg["oci_binary"], "os", "object",
                "--auth", "instance_principal",
                "--namespace-name", cfg["oci_namespace"],
                "--bucket-name", cfg["oci_bucket"],
            ]
            _run_command(obj_args[:3] + ["put"] + obj_args[3:] +
                         ["--name", key, "--file", str(archive)])
            downloaded = path / "downloaded.gpg"
            _run_command(obj_args[:3] + ["get"] + obj_args[3:] +
                         ["--name", key, "--file", str(downloaded)])
            if _checksum(downloaded) != archive_sha:
                raise BackupBlocked("remote_ciphertext_digest_mismatch")
            manifest = {
                "version": 1,
                "source_kind": "managed_supabase",
                "source_ref": cfg["source_ref"],
                "encrypted_object": key,
                "encrypted_sha256": archive_sha,
                "encrypted_bytes": archive.stat().st_size,
                "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "scope": BACKUP_SCOPE_VERDICT,
                "restore": "NOT_VALIDATED",
                "storage_objects": "NOT_BACKED_UP",
            }
            meta = path / "manifest.json"
            meta.write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")))
            os.chmod(meta, 0o600)
            manifest_key = key + ".manifest.json"
            _run_command(obj_args[:3] + ["put"] + obj_args[3:] +
                         ["--name", manifest_key, "--file", str(meta)])
            remote_meta = path / "manifest-remote.json"
            _run_command(obj_args[:3] + ["get"] + obj_args[3:] +
                         ["--name", manifest_key, "--file", str(remote_meta)])
            if _checksum(meta) != _checksum(remote_meta):
                raise BackupBlocked("remote_manifest_digest_mismatch")
            return {
                "source_ref": cfg["source_ref"], "ciphertext_sha256": archive_sha,
                "ciphertext_bytes": archive.stat().st_size,
                "scope": BACKUP_SCOPE_VERDICT, "restore": "NOT_VALIDATED",
            }
    finally:
        os.close(fd)


def main(argv=None, *, env=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    environment = os.environ if env is None else env
    try:
        cfg = validate_config(environment)
        if args.execute:
            require_owner_grant(environment)
            result = execute_encrypted_export(cfg, environment)
            print("MANAGED_DB_ENCRYPTED_OFFSITE=PASS "
                  f"bytes={result['ciphertext_bytes']} "
                  f"ciphertext_sha256={result['ciphertext_sha256']} "
                  f"scope={result['scope']} RESTORE=NOT_VALIDATED "
                  "AUDIT_VERDICT=NAO_APTO")
        else:
            ensure_preflight(cfg)
            print("MANAGED_STAGING_BACKUP_PREFLIGHT=PASS "
                  "DB_EXPORT=NOT_RUN STORAGE=NOT_VALIDATED AUDIT_VERDICT=NAO_APTO")
        return 0
    except BackupBlocked as exc:
        print(f"MANAGED_STAGING_BACKUP=FAIL reason={exc} "
              "AUDIT_VERDICT=NAO_APTO", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
