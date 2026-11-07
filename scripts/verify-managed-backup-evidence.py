#!/usr/bin/env python3
"""Fail-closed staging backup *provider metadata* probe; not a restore certificate.

Reads only Supabase Management API backup status. Never downloads database
content or logs credentials/project refs. Proves neither Storage objects nor
restore usability. A recent backup is necessary, never sufficient, for V5 APTO.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

REF_RE = re.compile(r"[a-z0-9]{16,40}")
MAX_RESPONSE = 262144


class AuditFailure(Exception):
    """Sanitized, non-sensitive verification failure."""


def validate_environment(staging_ref: str, production_ref: str, public_url: str) -> str:
    if not REF_RE.fullmatch(staging_ref or ""):
        raise AuditFailure("staging_ref_invalid")
    if not REF_RE.fullmatch(production_ref or "") or staging_ref == production_ref:
        raise AuditFailure("project_isolation_invalid")
    try:
        url = urlsplit(public_url)
        valid = (
            url.scheme == "https" and url.netloc == f"{staging_ref}.supabase.co"
            and url.username is None and url.password is None and
            url.port in (None, 443) and url.path in ("", "/") and
            not url.query and not url.fragment
        )
    except ValueError:
        valid = False
    if not valid:
        raise AuditFailure("runtime_project_identity_mismatch")
    return staging_ref


def fetch_backups(staging_ref: str, access_token: str, *, opener=urlopen) -> dict:
    if not REF_RE.fullmatch(staging_ref or ""):
        raise AuditFailure("staging_ref_invalid")
    # Accept only visible ASCII in a bearer header; urllib may otherwise
    # pass tabs, NUL or Unicode separators to the transport. Do not let a
    # synthetic provider or proxy interpret those as trusted credentials.
    # Normalize ONLY terminal CR/LF from a pasted secret file.
    header_token = access_token.rstrip("\r\n")
    if (not header_token or header_token != header_token.strip()
            or len(header_token) > 2048
            or any(ord(c) < 33 or ord(c) > 126 for c in header_token)):
        raise AuditFailure("management_token_missing_or_invalid")
    request = Request(
        "https://api.supabase.com/v1/projects/" + staging_ref + "/database/backups",
        headers={"Authorization": "Bearer " + header_token,
                 "Accept": "application/json",
                 "User-Agent": "SolangeAuditV5BackupEvidence/1"},
    )
    try:
        with opener(request, timeout=20) as response:
            payload = response.read(MAX_RESPONSE + 1)
    except HTTPError as exc:
        # Only expose a numeric HTTP status: exception text, URL, headers,
        # and response body can contain credentials or project identifiers.
        code = exc.code
        status = str(code) if type(code) is int and 400 <= code <= 599 else "unknown"
        raise AuditFailure("provider_query_failed_HTTP_" + status) from None
    except Exception as exc:
        # Preserve sanitization for transport errors with potentially sensitive text.
        raise AuditFailure("provider_query_failed_" + type(exc).__name__) from None
    if len(payload) > MAX_RESPONSE:
        raise AuditFailure("provider_response_oversized")
    # Provider JSON with repeated keys is ambiguous. In particular,
    # duplicated pitr_enabled/backups may downgrade a stale PITR to a snapshot.
    # Reject duplicates at every depth before trusting any backup metadata.
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate provider metadata property")
            result[key] = value
        return result

    try:
        decoded = json.loads(payload, object_pairs_hook=unique_pairs)
    except (UnicodeDecodeError, ValueError):
        raise AuditFailure("provider_response_invalid_json") from None
    if not isinstance(decoded, dict):
        raise AuditFailure("provider_response_invalid_shape")
    return decoded


def _timestamp(value) -> dt.datetime:
    if not isinstance(value, str) or len(value) > 50:
        raise AuditFailure("provider_timestamp_invalid")
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise AuditFailure("provider_timestamp_invalid") from None
    if result.tzinfo is None:
        raise AuditFailure("provider_timestamp_timezone_missing")
    return result.astimezone(dt.timezone.utc)


def _age(value: dt.datetime, now: dt.datetime, max_age: int) -> int:
    seconds = int((now - value).total_seconds())
    if seconds < -300:
        raise AuditFailure("provider_timestamp_in_future")
    if seconds > max_age:
        raise AuditFailure("provider_backup_stale")
    return max(seconds, 0)


def verify_backups(payload: object, now: dt.datetime,
                   max_age_seconds: int = 90000) -> dict:
    if (not isinstance(payload, dict)
            or not isinstance(payload.get("backups"), list)):
        raise AuditFailure("provider_response_invalid_shape")
    if now.tzinfo is None or not 0 < max_age_seconds <= 604800:
        raise AuditFailure("verification_parameters_invalid")
    # PITR mode is authoritative. A missing/malformed boolean must never
    # silently downgrade verification to a recent historical snapshot.
    pitr_enabled = payload.get("pitr_enabled")
    if type(pitr_enabled) is not bool:
        raise AuditFailure("pitr_state_invalid")
    if pitr_enabled:
        physical = payload.get("physical_backup_data")
        if not isinstance(physical, dict):
            raise AuditFailure("pitr_physical_backup_metadata_missing")
        latest = physical.get("latest_physical_backup_date_unix")
        if (type(latest) not in (int, float) or not math.isfinite(latest)
                or latest <= 0 or latest >= 1e12):
            raise AuditFailure("pitr_physical_backup_metadata_invalid")
        try:
            stamp = dt.datetime.fromtimestamp(latest, tz=dt.timezone.utc)
        except (OverflowError, OSError, ValueError):
            raise AuditFailure("pitr_physical_backup_metadata_invalid") from None
        age = _age(stamp, now, max_age_seconds)
        return {"ok": True, "completed_count": 0, "age_seconds": age,
                "source": "pitr"}
    # Only inspect historical snapshots when PITR is explicitly disabled.
    completed = []
    for backup in payload["backups"]:
        if not isinstance(backup, dict):
            raise AuditFailure("provider_response_invalid_shape")
        if backup.get("status") != "COMPLETED":
            continue
        completed.append(_timestamp(backup.get("inserted_at")))
    if completed:
        age = _age(max(completed), now, max_age_seconds)
        return {"ok": True, "completed_count": len(completed),
                "age_seconds": age, "source": "snapshot"}
    raise AuditFailure("no_completed_managed_backup")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-age-seconds", type=int, default=90000)
    args = parser.parse_args(argv)
    try:
        staging_ref = validate_environment(
            os.getenv("SUPABASE_STAGING_PROJECT_REF", ""),
            os.getenv("SUPABASE_PRODUCTION_PROJECT_REF", ""),
            os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""),
        )
        # Name-only presence in GitHub Environment metadata is not proof
        # that the runner received a PAT. Report an empty injection explicitly,
        # never print, hash or persist the token.
        injected_token = os.getenv("SUPABASE_ACCESS_TOKEN", "")
        if not injected_token:
            raise AuditFailure("management_token_not_injected")
        payload = fetch_backups(staging_ref, injected_token)
        summary = verify_backups(
            payload, dt.datetime.now(dt.timezone.utc), args.max_age_seconds,
        )
        print(f"MANAGED_STAGING_BACKUP=PASS source={summary['source']} "
              f"age_seconds={summary['age_seconds']} "
              f"completed_count={summary['completed_count']} "
              "RESTORE=NOT_VALIDATED STORAGE=NOT_VALIDATED AUDIT_VERDICT=NAO_APTO")
        return 0
    except AuditFailure as exc:
        print(f"MANAGED_STAGING_BACKUP=FAIL reason={exc} "
              "RESTORE=NOT_VALIDATED AUDIT_VERDICT=NAO_APTO", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
