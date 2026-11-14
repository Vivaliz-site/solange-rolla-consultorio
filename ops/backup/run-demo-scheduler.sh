#!/usr/bin/env bash
set -euo pipefail
ROOT=${ROOT:-/home/ubuntu/solange-recovered}
DEMO=${DEMO:-/home/ubuntu/solange-client-demo}
CONTAINER=${CONTAINER:-solange-backup-scheduler}

# Refuse to replace a live scheduler before proving that this installer is
# targeting a local Docker staging database. The published managed Supabase
# project must use provider backups/restore; its web container is not proof
# that a retired local PostgreSQL dump is a valid backup.
WEB=${SOLANGE_WEB_CONTAINER:-solange-client-demo-web}
RUNTIME_REF=$(docker exec "$WEB" printenv SUPABASE_STAGING_PROJECT_REF 2>/dev/null || true)
PRODUCTION_REF=$(docker exec "$WEB" printenv SUPABASE_PRODUCTION_PROJECT_REF 2>/dev/null || true)
RUNTIME_URL=$(docker exec "$WEB" printenv NEXT_PUBLIC_SUPABASE_URL 2>/dev/null || true)
refuse() { echo "scheduler_refused: $1" >&2; exit 1; }
case "$RUNTIME_REF" in ''|*[!a-z0-9]*) refuse runtime_identity_unknown ;; esac
[ "${#RUNTIME_REF}" -ge 16 ] && [ "${#RUNTIME_REF}" -le 40 ] || refuse runtime_identity_unknown
[ -n "$PRODUCTION_REF" ] && [ "$PRODUCTION_REF" != "$RUNTIME_REF" ] || refuse runtime_identity_unknown
case "$RUNTIME_URL" in
  "https://$RUNTIME_REF.supabase.co"|"https://$RUNTIME_REF.supabase.co/")
    refuse managed_supabase_runtime ;;
  http://127.0.0.1:*|http://localhost:*)
    printf '%s\n' "$RUNTIME_URL" | grep -Eq '^http://(127[.]0[.]0[.]1|localhost):[0-9]{1,5}/?$' || refuse runtime_identity_mismatch ;;
  *) refuse runtime_identity_mismatch ;;
esac
RUNTIME="$DEMO/runtime/backup"
DEST="$DEMO/backups"
mkdir -p "$RUNTIME" "$DEST"
chmod 700 "$RUNTIME" "$DEST"
install -m 755 "$ROOT/scripts/backup-homologation.sh" "$RUNTIME/backup-homologation.sh"
install -m 755 "$ROOT/scripts/check-backup-health.sh" "$RUNTIME/check-backup-health.sh"
install -m 755 "$ROOT/ops/backup/run-scheduler.sh" "$RUNTIME/run-scheduler.sh"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --restart unless-stopped \
  -e SOLANGE_BACKUP_DEST="$DEMO/backups" \
  -e SOLANGE_BACKUP_SCRIPT=/backup.sh \
  -e SOLANGE_BACKUP_HEALTH_SCRIPT=/check-backup-health.sh \
  -e SOLANGE_BACKUP_INTERVAL_SECONDS=86400 \
  -e SOLANGE_BACKUP_MAX_AGE_SECONDS=90000 \
  -v "$RUNTIME/backup-homologation.sh:/backup.sh:ro" \
  -v "$RUNTIME/check-backup-health.sh:/check-backup-health.sh:ro" \
  -v "$RUNTIME/run-scheduler.sh:/scheduler.sh:ro" \
  -v "$DEMO/backups:$DEMO/backups" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --health-cmd '/check-backup-health.sh' \
  --health-interval 5m --health-timeout 30s --health-retries 3 --health-start-period 2m \
  docker:27-cli sh /scheduler.sh >/dev/null
for _ in $(seq 1 90); do
  status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)
  [ "$status" = healthy ] && exit 0
  [ "$status" = unhealthy ] && break
  sleep 1
done
docker logs --tail 50 "$CONTAINER" >&2 || true
echo 'backup scheduler failed health verification' >&2
exit 1
