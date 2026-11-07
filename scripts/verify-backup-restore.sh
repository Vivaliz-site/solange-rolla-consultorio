#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Refusing restore: %s\n' "$1" >&2
  exit 1
}

[[ -v RESTORE_ENV ]] || fail 'RESTORE_ENV is required'
[[ "$RESTORE_ENV" == staging_restore_drill ]] || fail 'RESTORE_ENV must be staging_restore_drill'
[[ -v RESTORE_DB_URL ]] || fail 'RESTORE_DB_URL is required'
[[ -v BACKUP_FILE ]] || fail 'BACKUP_FILE is required'

# Restore must never use a hosted Supabase URL, a forwarded-looking database
# name, embedded credentials or any connection string with extra parameters.
# Use PGPASSWORD or a protected pgpass file for the disposable local database.
if ! python3 - <<'PY'
import os
import sys
from urllib.parse import urlsplit

try:
    url = urlsplit(os.environ["RESTORE_DB_URL"])
    valid = (
        url.scheme in ("postgres", "postgresql")
        and url.hostname in ("127.0.0.1", "::1", "localhost")
        and url.username in ("postgres", "supabase_admin")
        and url.password is None
        and url.port is not None
        and url.path == "/solange_restore"
        and not url.query
        and not url.fragment
    )
except (ValueError, KeyError):
    valid = False

sys.exit(0 if valid else 1)
PY
then
  fail 'target must be a local disposable solange_restore database without URL credentials'
fi

# A checksum that is merely printed is not integrity verification.
[[ -f "$BACKUP_FILE" && -s "$BACKUP_FILE" && ! -L "$BACKUP_FILE" ]] || fail 'backup missing or unsafe'
CHECKSUM_FILE="$BACKUP_FILE.sha256"
[[ -f "$CHECKSUM_FILE" && -s "$CHECKSUM_FILE" && ! -L "$CHECKSUM_FILE" ]] || fail 'checksum missing'
EXPECTED=$(awk 'NR==1 {print $1}' "$CHECKSUM_FILE")
[[ "$EXPECTED" =~ ^[0-9a-fA-F]{64}$ ]] || fail 'checksum invalid'
ACTUAL=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
[[ "$EXPECTED" == "$ACTUAL" ]] || fail 'checksum mismatch'

# A loopback address alone is insufficient: SSH/port tunnels can route it
# to a production server. Require an opt-in marker set on a *fresh disposable*
# database, and reject targets already containing clinical/application tables.
# Provision it ONLY on the throwaway database:
# ALTER DATABASE solange_restore SET shopvivaliz.restore_drill_only = 'yes';
MARKER_SQL="SELECT CASE WHEN current_database() = 'solange_restore' AND current_setting('shopvivaliz.restore_drill_only', true) = 'yes' AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public','clinical','auth') AND c.relkind IN ('r','p')) THEN 'READY' ELSE 'DENY' END;"
if ! MARKER=$(psql "$RESTORE_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "$MARKER_SQL" 2>/dev/null); then
  fail 'target isolation probe unavailable'
fi
[[ "$MARKER" == READY ]] || fail 'target isolation not certified'

# Keep archive contents and provider errors out of logs.
pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1 || fail 'invalid backup archive'
if ! pg_restore --no-owner --no-privileges --single-transaction --exit-on-error --dbname="$RESTORE_DB_URL" "$BACKUP_FILE" >/dev/null 2>&1; then
  fail 'transactional restore failed'
fi

# A successful exit is not proof that the restored schemas and RLS exist.
VERIFY_SQL="SELECT to_regclass('public.profiles') IS NOT NULL, to_regclass('clinical.records') IS NOT NULL, to_regclass('auth.users') IS NOT NULL, COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('clinical.records')), false), EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'clinical');"
if ! CHECK=$(psql "$RESTORE_DB_URL" -X -At -F '|' -v ON_ERROR_STOP=1 -c "$VERIFY_SQL" 2>/dev/null); then
  fail 'post-restore validation unavailable'
fi
[[ "$CHECK" == 't|t|t|t|t' ]] || fail 'critical tables or clinical RLS not validated'

echo 'Restore verification completed in isolated environment'
