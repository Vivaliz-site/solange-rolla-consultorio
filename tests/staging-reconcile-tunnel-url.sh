#!/bin/sh
# Testa somente a extracao de URL, sem iniciar containers ou tocar staging.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
SRC="$ROOT/ops/staging/reconcile-demo.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
# Extrai apenas a funcao para evitar o loop de operacao do reconciliador.
awk '/^current_tunnel_url\(\) \{/ {capture=1} /^ensure_running\(\) \{/ {capture=0} capture {print}' "$SRC" > "$TMP/function.sh"
[ -s "$TMP/function.sh" ] || { echo 'FAIL: funcao ausente'; exit 1; }
cat > "$TMP/docker" <<'STUB'
#!/bin/sh
case "$1" in
  inspect)
    case "$*" in
      *State.Status*) printf '%s\n' "${TEST_STATE:-running}" ;;
      *State.StartedAt*) printf '%s\n' 2026-11-13T07:00:00.000000000Z ;;
      *) exit 9 ;;
    esac
    ;;
  logs)
    case "$*" in
      *'--since 2026-11-13T07:00:00.000000000Z --tail 300 solange-demo-tunnel'*)
        printf '%s\n' 'Current tunnel https://live-current.trycloudflare.com'
        ;;
      *)
        printf '%s\n' 'Historical tunnel https://stale-historical.trycloudflare.com'
        ;;
    esac
    ;;
  *) exit 9 ;;
esac
STUB
chmod +x "$TMP/docker"
. "$TMP/function.sh"
PATH="$TMP:$PATH"
export PATH
actual=$(current_tunnel_url)
[ "$actual" = 'https://live-current.trycloudflare.com' ] || {
  echo "FAIL: URL de ciclo anterior reutilizada ($actual)"
  exit 1
}
TEST_STATE=exited
export TEST_STATE
actual=$(current_tunnel_url)
[ -z "$actual" ] || { echo 'FAIL: URL de container parado reutilizada'; exit 1; }
echo 'PASS: URL extraida exclusivamente do ciclo atual e container em execucao'
