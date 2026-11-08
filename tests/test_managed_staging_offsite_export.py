"""Synthetic contract tests for a managed-staging-only encrypted offsite export.

No clinical records, passwords, tokens, OCI writes or real network calls.
"""
from __future__ import annotations

import importlib.util
import os
import subprocess
import json
import hashlib
import shutil
import datetime as dt
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "backup-managed-staging-offsite.py"
spec = importlib.util.spec_from_file_location("solange_managed_offsite_backup", SCRIPT)
backup = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(backup)

STAGE = "abcdefghijklmnopqrst"
PROD = "zyxwvutsrqponmlkjihg"
FINGERPRINT = "ABCDEF0123456789ABCDEF0123456789ABCDEF01"


def good_env():
    return {
        "SUPABASE_STAGING_PROJECT_REF": STAGE,
        "SUPABASE_PRODUCTION_PROJECT_REF": PROD,
        "NEXT_PUBLIC_SUPABASE_URL": f"https://{STAGE}.supabase.co",
        "SUPABASE_MANAGED_DB_HOST": "aws-0-sa-east-1.pooler.supabase.com",
        "SUPABASE_MANAGED_DB_PORT": "5432",
        "SUPABASE_MANAGED_DB_USER": f"postgres.{STAGE}",
        "SUPABASE_DB_PASSWORD": "synthetic-password-never-log",
        "SOLANGE_BACKUP_GPG_RECIPIENT": FINGERPRINT,
        "SOLANGE_BACKUP_OCI_NAMESPACE": "tenanttest",
        "SOLANGE_BACKUP_OCI_BUCKET": "private-clinic-backup",
    }


class ManagedOffsiteContract(unittest.TestCase):
    def test_good_canonical_identity(self):
        config = backup.validate_config(good_env())
        self.assertEqual(config["source_ref"], STAGE)
        self.assertEqual(config["db_host"], good_env()["SUPABASE_MANAGED_DB_HOST"])
        self.assertEqual(config["db_user"], f"postgres.{STAGE}")

    def test_requires_current_project_match(self):
        env = good_env()
        env["NEXT_PUBLIC_SUPABASE_URL"] = f"https://{PROD}.supabase.co"
        with self.assertRaisesRegex(backup.BackupBlocked, "runtime_project_identity_mismatch"):
            backup.validate_config(env)

    def test_refuses_production_as_staging(self):
        env = good_env()
        env["SUPABASE_PRODUCTION_PROJECT_REF"] = STAGE
        with self.assertRaisesRegex(backup.BackupBlocked, "project_isolation_invalid"):
            backup.validate_config(env)

    def test_pooler_username_must_bind_project_ref(self):
        env = good_env()
        env["SUPABASE_MANAGED_DB_USER"] = f"postgres.{PROD}"
        with self.assertRaisesRegex(backup.BackupBlocked, "database_identity_mismatch"):
            backup.validate_config(env)

    def test_untrusted_source_host_is_rejected(self):
        for bad in ["attacker.example", "aws-0-sa-east-1.pooler.supabase.com.evil",
                    "127.0.0.1", "db." + PROD + ".supabase.co"]:
            env = good_env()
            env["SUPABASE_MANAGED_DB_HOST"] = bad
            with self.subTest(host=bad), self.assertRaises(backup.BackupBlocked):
                backup.validate_config(env)

    def test_rejects_transaction_pooler_port(self):
        env = good_env()
        env["SUPABASE_MANAGED_DB_PORT"] = "6543"
        with self.assertRaisesRegex(backup.BackupBlocked, "database_session_port_invalid"):
            backup.validate_config(env)

    def test_pg_client_major_must_match_managed_postgres17(self):
        self.assertEqual(backup.pg_dump_major("pg_dump (PostgreSQL) 17.6"), 17)
        with self.assertRaisesRegex(backup.BackupBlocked, "pg_dump_major_mismatch"):
            backup.require_pg17("pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15)")
        backup.require_pg17("pg_dump (PostgreSQL) 17.6")

    def test_managed_tls_must_have_explicit_ca_file(self):
        cfg = backup.validate_config(good_env())
        with self.assertRaisesRegex(backup.BackupBlocked, "database_ca_missing"):
            backup.require_supabase_ca(cfg)

    def test_managed_tls_ca_digest_prevents_tamper(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "ca.crt"
            p.write_text("-----BEGIN CERTIFICATE-----\n" + "A" * 120 + "\n-----END CERTIFICATE-----\n")
            p.chmod(0o600)
            env = good_env()
            env["SUPABASE_MANAGED_DB_CA_FILE"] = str(p)
            env["SUPABASE_MANAGED_DB_CA_SHA256"] = hashlib.sha256(p.read_bytes()).hexdigest()
            cfg = backup.validate_config(env)
            self.assertEqual(backup.require_supabase_ca(cfg), str(p))
            p.write_text("-----BEGIN CERTIFICATE-----\n" + "B" * 120 + "\n-----END CERTIFICATE-----\n")
            with self.assertRaisesRegex(backup.BackupBlocked, "database_ca_digest_mismatch"):
                backup.require_supabase_ca(cfg)

    def test_managed_tls_never_implicitly_trusts_system(self):
        self.assertNotIn('pg_env["PGSSLROOTCERT"] = "system"', SCRIPT.read_text())

    def test_offsite_workflow_has_ca_config(self):
        wf = (ROOT / ".github/workflows/staging-managed-backup-evidence.yml").read_text()
        self.assertIn("SUPABASE_MANAGED_DB_CA_FILE", wf)
        self.assertIn("SUPABASE_MANAGED_DB_CA_SHA256", wf)

    def test_grant_is_failing_closed(self):
        with self.assertRaisesRegex(backup.BackupBlocked, "owner_write_grant_missing"):
            backup.require_owner_grant(good_env())
        env = good_env()
        env["SOLANGE_MANAGED_BACKUP_OWNER_GRANT"] = "scoped-191-v1"
        with self.assertRaisesRegex(backup.BackupBlocked, "owner_approved_grant_file_missing"):
            backup.require_owner_grant(env)
        with tempfile.TemporaryDirectory() as t:
            path = Path(t) / "grant.json"
            payload = {
                "approved_by": "shopvivaliz-human",
                "action": "managed_staging_db_encrypted_offsite",
                "source_ref": STAGE,
                "oci_bucket": env["SOLANGE_BACKUP_OCI_BUCKET"],
                "gpg_fpr": FINGERPRINT,
                "scope": backup.BACKUP_SCOPE_VERDICT,
                "expires_at": "2026-11-09T02:00:00Z",
            }
            path.write_text(json.dumps(payload))
            now = dt.datetime(2026, 11, 8, tzinfo=dt.timezone.utc)
            backup.require_owner_grant(env, grant_path=path, now=now)
            payload["source_ref"] = PROD
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(backup.BackupBlocked, "owner_approved_grant_scope_or_expiry_invalid"):
                backup.require_owner_grant(env, grant_path=path, now=now)
            payload["source_ref"] = STAGE
            payload["gpg_fpr"] = "0" * 40
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(backup.BackupBlocked, "owner_approved_grant_scope_or_expiry_invalid"):
                backup.require_owner_grant(env, grant_path=path, now=now)
            payload["gpg_fpr"] = FINGERPRINT
            payload["expires_at"] = "2026-11-07T02:00:00Z"
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(backup.BackupBlocked, "owner_approved_grant_scope_or_expiry_invalid"):
                backup.require_owner_grant(env, grant_path=path, now=now)

    def test_runner_must_not_possess_recipient_private_key(self):
        cfg = backup.validate_config(good_env())
        with patch.object(backup, "_run_command", side_effect=[
            b"pg_dump (PostgreSQL) 17.6\n",
            f"fpr:::::::::{FINGERPRINT}:\n".encode(),
            f"sec:u:2048:1:AAAA:0:0::::::\nfpr:::::::::{FINGERPRINT}:\n".encode(),
        ]) as run:
            with self.assertRaisesRegex(backup.BackupBlocked, "offline_private_key_present_on_runner"):
                backup.ensure_preflight(cfg)
            self.assertEqual(run.call_count, 3, "must block before private OCI lookup or DB access")

    def test_private_oci_bucket_mandatory(self):
        backup.require_private_oci_bucket({"public-access-type": "NoPublicAccess"})
        for value in ("ObjectRead", "ObjectReadWithoutList", None):
            with self.subTest(value=value), self.assertRaisesRegex(backup.BackupBlocked, "oci_bucket_not_private"):
                backup.require_private_oci_bucket({"public-access-type": value})

    def test_dump_command_contains_only_app_scopes(self):
        conf = backup.validate_config(good_env())
        cmd = backup.make_pg_dump_command(conf, "/usr/lib/postgresql/17/bin/pg_dump")
        for schema in ("public", "clinical", "auth", "storage"):
            self.assertIn(f"--schema={schema}", cmd)
        self.assertIn("--no-owner", cmd)
        self.assertIn("--no-acl", cmd)
        self.assertNotIn(good_env()["SUPABASE_DB_PASSWORD"], " ".join(cmd))
        self.assertNotIn("production", " ".join(cmd))

    def test_write_grant_denied_before_any_external_call(self):
        env = good_env()
        with patch.object(backup, "execute_encrypted_export") as export:
            self.assertEqual(backup.main(["--execute"], env=env), 2)
            export.assert_not_called()

    def test_real_destination_key_is_unpredictable_and_never_overwrites_latest(self):
        key = backup.object_key(STAGE, "20261108T071000Z", "a" * 32)
        self.assertTrue(key.startswith(f"managed-solange-staging/{STAGE}/"))
        self.assertTrue(key.endswith(".dump.gpg"))
        self.assertNotIn("latest", key)

    def test_explicit_storage_gap_does_not_certify_recovery(self):
        self.assertEqual(backup.BACKUP_SCOPE_VERDICT, "DB_ONLY_STORAGE_NOT_BACKED_UP")

    def test_existing_workflow_never_exports_on_schedule(self):
        workflow = (ROOT / ".github" / "workflows" /
                    "staging-managed-backup-evidence.yml").read_text()
        self.assertIn("cron: '29 4 * * *'", workflow)
        self.assertIn("github.event_name == 'workflow_dispatch' && inputs.mode == 'offsite_export'", workflow)
        self.assertIn("python3 scripts/backup-managed-staging-offsite.py --execute", workflow)
        self.assertIn("SOLANGE_MANAGED_BACKUP_OWNER_GRANT", workflow)

    def test_synthetic_full_encrypted_upload_and_readback(self):
        # Entire exercise uses fake binaries and fictitious data; no real network
        # or live staging values. The backup must remain labeled DB-only.
        with tempfile.TemporaryDirectory(prefix="solange-encrypted-export-") as t:
            root = Path(t)
            fakebin = root / "bin"
            fakebin.mkdir()
            remote = root / "fake-oci"
            remote.mkdir()
            pgbin = fakebin / "pg_dump17"
            pgbin.write_text(
                "#!/usr/bin/env python3\nimport sys\n"
                "if '--version' in sys.argv:\n"
                " print('pg_dump (PostgreSQL) 17.6')\n"
                "else:\n sys.stdout.buffer.write(b'fictional-fixture-only-' * 120)\n"
            )
            gpg = fakebin / "gpg"
            gpg.write_text(
                "#!/usr/bin/env python3\nimport sys\n"
                "if '--list-keys' in sys.argv:\n"
                f" print('fpr:::::::::{FINGERPRINT}:')\n"
                "elif '--list-secret-keys' in sys.argv:\n sys.exit(0)\n"
                "else:\n sys.stdout.buffer.write(b'ENCRYPTED_FIXTURE:' + sys.stdin.buffer.read())\n"
            )
            cli = fakebin / "oci"
            cli.write_text(
                "#!/usr/bin/env python3\n"
                "import os,sys,pathlib,shutil,json\n"
                "a=sys.argv[1:]\n"
                "if a[:3]==['os','bucket','get']:\n"
                " print(json.dumps({'data': {'public-access-type':'NoPublicAccess'}}));sys.exit(0)\n"
                "if a[:3] not in (['os','object','put'],['os','object','get']):\n"
                " sys.exit(43)\n"
                "name=a[a.index('--name')+1];file=pathlib.Path(a[a.index('--file')+1]);"
                "remote=pathlib.Path(os.environ['FAKE_OCI_ROOT'])/name\n"
                "if a[2]=='put':\n"
                " remote.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,remote)\n"
                "else:\n"
                " shutil.copyfile(remote,file)\n"
                " if os.environ.get('FAKE_TAMPER')=='1':file.write_bytes(b'tampered')\n"
            )
            for binary in (pgbin, gpg, cli):
                binary.chmod(0o700)
            # A synthetic owner-reviewed file exists ONLY inside this fixture,
            # never in a real production branch before human approval.
            sandbox = root / "sandbox"
            (sandbox / "scripts").mkdir(parents=True)
            grant_dir = sandbox / "security" / "owner-approvals"
            grant_dir.mkdir(parents=True)
            export_script = sandbox / "scripts" / SCRIPT.name
            shutil.copyfile(SCRIPT, export_script)
            (grant_dir / "managed-staging-backup-191.json").write_text(json.dumps({
                "approved_by": "shopvivaliz-human",
                "action": "managed_staging_db_encrypted_offsite",
                "source_ref": STAGE,
                "oci_bucket": "private-clinic-backup",
                "gpg_fpr": FINGERPRINT,
                "scope": backup.BACKUP_SCOPE_VERDICT,
                "expires_at": (dt.datetime.now(dt.timezone.utc) +
                               dt.timedelta(hours=1)).isoformat(),
            }))
            e = dict(os.environ)
            e.update(good_env())
            ca = root / "provider-ca.crt"
            ca.write_text("-----BEGIN CERTIFICATE-----\n" + "A" * 120 + "\n-----END CERTIFICATE-----\n")
            ca.chmod(0o600)
            e["SUPABASE_MANAGED_DB_CA_FILE"] = str(ca)
            e["SUPABASE_MANAGED_DB_CA_SHA256"] = hashlib.sha256(ca.read_bytes()).hexdigest()
            e.update({
                "HOME": str(root), "PATH": f"{fakebin}:{e.get('PATH','')}",
                "SOLANGE_PGDUMP17_BIN": str(pgbin),
                "SOLANGE_OCI_CLI_BIN": str(cli),
                "SOLANGE_MANAGED_BACKUP_OWNER_GRANT": "scoped-191-v1",
                "FAKE_OCI_ROOT": str(remote),
            })
            result = subprocess.run(
                ["python3", str(export_script), "--execute"], env=e,
                capture_output=True, text=True, timeout=10
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("MANAGED_DB_ENCRYPTED_OFFSITE=PASS", result.stdout)
            self.assertIn("DB_ONLY_STORAGE_NOT_BACKED_UP", result.stdout)
            self.assertNotIn("synthetic-password-never-log", result.stdout + result.stderr)
            encrypted = list(remote.glob("**/*.dump.gpg"))
            self.assertEqual(len(encrypted), 1)
            self.assertTrue(encrypted[0].read_bytes().startswith(b"ENCRYPTED_FIXTURE:"))
            self.assertEqual(len(list(remote.glob("**/*.manifest.json"))), 1)
            manifest = json.loads(next(remote.glob("**/*.manifest.json")).read_text())
            self.assertEqual(manifest["source_ref"], STAGE)
            self.assertEqual(manifest["storage_objects"], "NOT_BACKED_UP")
            self.assertFalse(list(root.glob("**/*.dump")), "unencrypted dump must never persist")
            e["FAKE_TAMPER"] = "1"
            tampered = subprocess.run(
                ["python3", str(export_script), "--execute"], env=e,
                capture_output=True, text=True, timeout=10
            )
            self.assertEqual(tampered.returncode, 2)
            self.assertIn("remote_ciphertext_digest_mismatch", tampered.stderr)
            self.assertNotIn("synthetic-password-never-log", tampered.stderr)


if __name__ == "__main__":
    unittest.main()
