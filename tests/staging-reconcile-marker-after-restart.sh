#!/bin/sh
# Teste sintetico de persistencia: nao usa Docker, URL nem staging reais.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
SRC="$ROOT/ops/staging/reconcile-demo.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
mkdir -p "$TMP/app" "$TMP/bin" "$TMP/state"
printf '{}\n' > "$TMP/app/package.json"
printf 'APP_URL=https://old.trycloudflare.com\n' > "$TMP/app/.env.production.local"
printf 'https://old.trycloudflare.com\n' > "$TMP/state/current-url.txt"
awk '/^reconcile_url\(\) \{/ {capture=1} /^while :; do/ {capture=0} capture {print}' "$SRC" > "$TMP/function.sh"
[ -s "$TMP/function.sh" ] || { echo 'FAIL: reconcile_url ausente'; exit 1; }
cat > "$TMP/bin/docker" <<'STUB'
#!/bin/sh
[ "$1" = restart ] || exit 8
printf 'restart\n' >> "$TEST_RESTART_LOG"
[ "${TEST_RESTART_FAIL:-0}" = 0 ]
STUB
chmod +x "$TMP/bin/docker"
APP="$TMP/app"
URL_FILE="$TMP/state/current-url.txt"
WEB=solange-client-demo-web
TEST_RESTART_LOG="$TMP/restarts"
export APP URL_FILE WEB TEST_RESTART_LOG
log() { :; }
app_valid() { [ -f "$APP/package.json" ] && [ -f "$APP/.env.production.local" ]; }
current_tunnel_url() { printf '%s\n' 'https://live.trycloudflare.com'; }
public_health_ok() { return 0; }
. "$TMP/function.sh"
PATH="$TMP/bin:$PATH"
export PATH
: > "$TEST_RESTART_LOG"
TEST_RESTART_FAIL=1
export TEST_RESTART_FAIL
reconcile_url >/dev/null
[ ! -f "$URL_FILE" ] || {
  echo 'FAIL: marcador nao invalidado apos restart falhar'
  exit 1
}
[ "$(cat "$APP/.env.production.local")" = 'APP_URL=https://live.trycloudflare.com' ] || {
  echo 'FAIL: configuracao preliminar nao atualizada'
  exit 1
}
TEST_RESTART_FAIL=0
export TEST_RESTART_FAIL
reconcile_url >/dev/null
[ "$(cat "$URL_FILE")" = 'https://live.trycloudflare.com' ] || {
  echo 'FAIL: marcador nao atualizado apos reinicio'
  exit 1
}
[ "$(wc -l < "$TEST_RESTART_LOG" | tr -d ' ')" = 2 ] || {
  echo 'FAIL: faltou repetir reinicio em caso de erro'
  exit 1
}
reconcile_url >/dev/null
[ "$(wc -l < "$TEST_RESTART_LOG" | tr -d ' ')" = 2 ] || {
  echo 'FAIL: reconciliacao idempotente reiniciou novamente'
  exit 1
}
echo 'PASS: marcador so avancou apos restart, retry idempotente'
