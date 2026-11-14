#!/bin/sh
set -eu
DEST=${SOLANGE_BACKUP_DEST:-/home/ubuntu/solange-client-demo/backups}
SOURCE_CONTAINER=${SOLANGE_DB_CONTAINER:-supabase_db_solange-client-demo}
NETWORK=${SOLANGE_DB_NETWORK:-supabase_network_solange-client-demo}
[ -d "$DEST" ] && [ -w "$DEST" ] || { echo 'backup_failed: destination unavailable' >&2; exit 1; }

# This legacy dump only targets a local Docker Postgres instance. Do not allow
# a managed Supabase runtime to be marked protected by its unrelated contents.
# Read only non-secret project identity fields from the actual published web.
WEB=${SOLANGE_WEB_CONTAINER:-solange-client-demo-web}
RUNTIME_REF=$(docker exec "$WEB" printenv SUPABASE_STAGING_PROJECT_REF 2>/dev/null || true)
PRODUCTION_REF=$(docker exec "$WEB" printenv SUPABASE_PRODUCTION_PROJECT_REF 2>/dev/null || true)
RUNTIME_URL=$(docker exec "$WEB" printenv NEXT_PUBLIC_SUPABASE_URL 2>/dev/null || true)
case "$RUNTIME_REF" in ''|*[!a-z0-9]*) echo 'backup_failed: runtime_identity_unknown' >&2; exit 1 ;; esac
[ "${#RUNTIME_REF}" -ge 16 ] && [ "${#RUNTIME_REF}" -le 40 ] || { echo 'backup_failed: runtime_identity_unknown' >&2; exit 1; }
[ -n "$PRODUCTION_REF" ] && [ "$PRODUCTION_REF" != "$RUNTIME_REF" ] || { echo 'backup_failed: runtime_identity_unknown' >&2; exit 1; }
case "$RUNTIME_URL" in
  "https://$RUNTIME_REF.supabase.co"|"https://$RUNTIME_REF.supabase.co/")
    echo 'backup_failed: source_identity_mismatch (managed runtime cannot use local dump)' >&2
    exit 1
    ;;
  http://127.0.0.1:*|http://localhost:*) : ;; # Explicit local dev only.
  *) echo 'backup_failed: runtime_identity_mismatch' >&2; exit 1 ;;
esac

TS=$(date -u +%Y%m%dT%H%M%SZ)
FULL="$DEST/solange-homologacao-$TS.dump"; APP="$DEST/solange-homologacao-app-auth-$TS.dump"
FULLTMP="$FULL.partial"; APPTMP="$APP.partial"
PW=$(docker inspect "$SOURCE_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_PASSWORD=//p' | head -1)
[ -n "$PW" ] || { echo 'backup_failed: database credential unavailable' >&2; exit 1; }
trap 'rm -f "$FULLTMP" "$APPTMP"' EXIT
docker run --rm --network "$NETWORK" -e PGPASSWORD="$PW" -v "$DEST:/backup" postgres:15-alpine pg_dump -h "$SOURCE_CONTAINER" -U postgres -d postgres -Fc -f "/backup/$(basename "$FULLTMP")"
docker run --rm --network "$NETWORK" -e PGPASSWORD="$PW" -v "$DEST:/backup" postgres:15-alpine pg_dump -h "$SOURCE_CONTAINER" -U postgres -d postgres -Fc -n public -n clinical -n auth -f "/backup/$(basename "$APPTMP")"
docker run --rm -v "$DEST:/backup" alpine sh -lc "chown 1001:1001 '/backup/$(basename "$FULLTMP")' '/backup/$(basename "$APPTMP")'; chmod 600 '/backup/$(basename "$FULLTMP")' '/backup/$(basename "$APPTMP")'"
[ -s "$FULLTMP" ] && [ -s "$APPTMP" ] || { echo 'backup_failed: empty dump' >&2; exit 1; }
mv "$FULLTMP" "$FULL"; mv "$APPTMP" "$APP"
sha256sum "$FULL" > "$FULL.sha256"; sha256sum "$APP" > "$APP.sha256"
printf '%s full=%s restore_subset=%s\n' "$(date -u +%FT%TZ)" "$(basename "$FULL")" "$(basename "$APP")" > "$DEST/LAST_SUCCESS"
docker run --rm -v "$DEST:/backup" alpine sh -lc "chown 1001:1001 '/backup/$(basename "$FULL.sha256")' '/backup/$(basename "$APP.sha256")' /backup/LAST_SUCCESS; chmod 600 '/backup/$(basename "$FULL.sha256")' '/backup/$(basename "$APP.sha256")' /backup/LAST_SUCCESS"
find "$DEST" -maxdepth 1 -type f -name 'solange-homologacao-*.dump' -mtime +14 -delete
find "$DEST" -maxdepth 1 -type f -name 'solange-homologacao-*.dump.sha256' -mtime +14 -delete
echo "backup_success: $(basename "$FULL")"
