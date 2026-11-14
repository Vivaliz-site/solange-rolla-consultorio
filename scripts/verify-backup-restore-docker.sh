#!/bin/sh
set -eu
: "${BACKUP_FILE:?BACKUP_FILE is required}"
# A portable local restore is not evidence of hosted Supabase recovery.
# Never start Docker with a missing, altered or symlinked backup archive.
fail_archive() { echo "local_restore_refused: $1" >&2; exit 1; }
[ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ] && [ ! -L "$BACKUP_FILE" ] || fail_archive archive_missing_or_unsafe
CHECKSUM_FILE="$BACKUP_FILE.sha256"
[ -f "$CHECKSUM_FILE" ] && [ -s "$CHECKSUM_FILE" ] && [ ! -L "$CHECKSUM_FILE" ] || fail_archive checksum_missing_or_unsafe
EXPECTED=$(awk 'NR==1 {print $1}' "$CHECKSUM_FILE")
LENGTH=$(printf '%s' "$EXPECTED" | wc -c)
[ "$LENGTH" -eq 64 ] || fail_archive checksum_invalid
case "$EXPECTED" in *[!a-fA-F0-9]*) fail_archive checksum_invalid ;; esac
ACTUAL=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
EXPECTED_LOWER=$(echo "$EXPECTED" | tr 'A-F' 'a-f')
[ "$EXPECTED_LOWER" = "$ACTUAL" ] || fail_archive checksum_mismatch
NAME=solange-restore-drill-$$
DIR=$(dirname "$BACKUP_FILE")
BASE=$(basename "$BACKUP_FILE")
IMAGE=public.ecr.aws/supabase/postgres:15.8.1.085
RESTORE_DB=solange_restore
RESTORE_ROLE=supabase_admin
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
START=$(date +%s)
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=restore-only -v "$DIR:/backup:ro" "$IMAGE" >/dev/null
i=0
until docker logs "$NAME" 2>&1 | grep -q 'PostgreSQL init process complete; ready for start up.'; do
  i=$((i+1))
  [ "$i" -lt 30 ] || { echo 'postgres initialization did not complete in time' >&2; exit 1; }
  sleep 1
done
i=0
until docker exec "$NAME" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1; do
  i=$((i+1))
  [ "$i" -lt 30 ] || { echo 'postgres final server did not become queryable in time' >&2; exit 1; }
  sleep 1
done
docker exec -e PGPASSWORD=restore-only "$NAME" createdb -U "$RESTORE_ROLE" -T template0 "$RESTORE_DB"
docker exec -e PGPASSWORD=restore-only "$NAME" psql -U "$RESTORE_ROLE" -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -c 'drop schema public;'
docker exec -e PGPASSWORD=restore-only "$NAME" pg_restore -U "$RESTORE_ROLE" -d "$RESTORE_DB" --no-owner --no-privileges --exit-on-error "/backup/$BASE"
RESULT=$(docker exec -e PGPASSWORD=restore-only "$NAME" psql -U "$RESTORE_ROLE" -d "$RESTORE_DB" -Atc "select to_regclass('public.profiles') is not null, to_regclass('clinical.records') is not null, to_regclass('auth.users') is not null, (select count(*) from pg_policies)>0;")
[ "$RESULT" = 't|t|t|t' ] || { echo "restore verification failed: $RESULT" >&2; exit 1; }
END=$(date +%s)
echo "restore_success scope=legacy_local_only managed_staging_certified=false rto_seconds=$((END-START))"
