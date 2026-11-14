#!/bin/sh
# Teste sintetico do indicador publico de staging; sem Docker, DNS ou HTTP reais.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
SRC="$ROOT/ops/staging/reconcile-demo.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
mkdir -p "$TMP/app" "$TMP/state" "$TMP/bin"
printf '{}\n' > "$TMP/app/package.json"
printf 'APP_URL=https://old.trycloudflare.com\n' > "$TMP/app/.env.production.local"
printf 'https://old.trycloudflare.com\n' > "$TMP/state/current-url.txt"
awk '/^public_health_ok\(\) \{/ {copy=1} /^ensure_running\(\) \{/ {copy=0} copy {print}' "$SRC" > "$TMP/health.sh"
awk '/^reconcile_url\(\) \{/ {copy=1} /^while :; do/ {copy=0} copy {print}' "$SRC" > "$TMP/reconcile.sh"
cat "$TMP/health.sh" "$TMP/reconcile.sh" > "$TMP/functions.sh"
cat > "$TMP/bin/docker" <<'STUB'
#!/bin/sh
case "$1" in
  exec)
    printf 'public_check\n' >> "$TEST_PUBLIC_LOG"
    case "$*" in *'https://live.trycloudflare.com/api/health'*) ;; *) exit 9 ;; esac
    [ "${TEST_HEALTH_STATUS:-good}" = good ]
    ;;
  restart)
    printf 'restart\n' >> "$TEST_RESTART_LOG"
    [ "${TEST_RESTART_FAIL:-0}" = 0 ]
    ;;
  *) exit 8 ;;
esac
STUB
chmod +x "$TMP/bin/docker"
APP="$TMP/app"
URL_FILE="$TMP/state/current-url.txt"
WEB=solange-client-demo-web
TEST_RESTART_LOG="$TMP/restarts"
TEST_PUBLIC_LOG="$TMP/public_checks"
TEST_TUNNEL=live
export APP URL_FILE WEB TEST_RESTART_LOG TEST_PUBLIC_LOG TEST_TUNNEL
log() { printf '%s\n' "$*" >> "$TMP/actions"; }
app_valid() { [ -f "$APP/package.json" ] && [ -f "$APP/.env.production.local" ]; }
current_tunnel_url() {
  [ "$TEST_TUNNEL" = live ] && printf '%s\n' https://live.trycloudflare.com
  return 0
}
. "$TMP/functions.sh"
PATH="$TMP/bin:$PATH"
export PATH
: > "$TEST_RESTART_LOG"
: > "$TEST_PUBLIC_LOG"
TEST_HEALTH_STATUS=failed; export TEST_HEALTH_STATUS
reconcile_url
[ ! -f "$URL_FILE" ] || { echo 'RED: URL publica invalida permaneceu no marcador'; exit 1; }
grep -qx 'APP_URL=https://old.trycloudflare.com' "$APP/.env.production.local" || {
  echo 'FAIL: URL nao verificada alterou o ambiente'; exit 1;
}
[ ! -s "$TEST_RESTART_LOG" ] || { echo 'FAIL: restart com tunnel indisponivel'; exit 1; }
TEST_HEALTH_STATUS=good; export TEST_HEALTH_STATUS
reconcile_url
grep -qx 'https://live.trycloudflare.com' "$URL_FILE" || {
  echo 'FAIL: URL valida nao foi publicada'; exit 1;
}
grep -qx 'APP_URL=https://live.trycloudflare.com' "$APP/.env.production.local" || {
  echo 'FAIL: APP_URL valida nao foi aplicada'; exit 1;
}
[ "$(wc -l < "$TEST_RESTART_LOG" | tr -d ' ')" = 1 ] || {
  echo 'FAIL: reinicio duplicado'; exit 1;
}
TEST_HEALTH_STATUS=failed; export TEST_HEALTH_STATUS
reconcile_url
[ ! -f "$URL_FILE" ] || { echo 'FAIL: marcador nao invalidado apos erro publico'; exit 1; }
TEST_TUNNEL=none; export TEST_TUNNEL
reconcile_url
[ ! -f "$URL_FILE" ] || { echo 'FAIL: marcador existente sem tunnel'; exit 1; }
TEST_TUNNEL=live; TEST_HEALTH_STATUS=good; export TEST_TUNNEL TEST_HEALTH_STATUS
reconcile_url
grep -qx 'https://live.trycloudflare.com' "$URL_FILE" || {
  echo 'FAIL: recuperacao nao republicou marcador'; exit 1;
}
[ -s "$TEST_PUBLIC_LOG" ] || { echo 'FAIL: nenhuma verificacao publica'; exit 1; }
echo 'PASS: URL so e publicada com health publico e invalidada quando indisponivel'
