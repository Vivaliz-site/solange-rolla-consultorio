#!/bin/sh
set -eu

APP=/app
URL_FILE=/state/current-url.txt
WEB=solange-client-demo-web

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
app_valid() {
  [ -f "$APP/package.json" ] && [ -f "$APP/.env.production.local" ]
}
current_tunnel_url() {
  # O log agrega ciclos anteriores; a ultima URL global pode estar revogada.
  # Consultar somente a instancia efetivamente ativa e limitar o volume lido.
  state=$(docker inspect -f '{{.State.Status}}' solange-demo-tunnel 2>/dev/null || true)
  [ "$state" = running ] || return 0
  started=$(docker inspect -f '{{.State.StartedAt}}' solange-demo-tunnel 2>/dev/null || true)
  [ -n "$started" ] || return 0
  docker logs --since "$started" --tail 300 solange-demo-tunnel 2>&1 | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true
}
ensure_running() {
  for c in solange-demo-gateway solange-demo-tunnel; do
    state=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || true)
    [ "$state" = running ] || {
      log "starting $c state=${state:-missing}"
      docker start "$c" >/dev/null 2>&1 || true
    }
  done
  if ! app_valid; then
    log 'app incomplete; web start deferred'
    return 0
  fi
  state=$(docker inspect -f '{{.State.Status}}' "$WEB" 2>/dev/null || true)
  [ "$state" = running ] || {
    log "starting $WEB state=${state:-missing}"
    docker start "$WEB" >/dev/null 2>&1 || true
  }
}

reconcile_url() {
  app_valid || { log 'app incomplete; URL reconcile deferred'; return 0; }
  url=$(current_tunnel_url)
  [ -n "$url" ] || { log 'tunnel URL unavailable'; return 0; }
  printf '%s\n' "$url" > "$URL_FILE"
  current=$(sed -n 's/^APP_URL=//p' "$APP/.env.production.local" | tail -1)
  [ "$current" = "$url" ] && return 0

  log "tunnel URL changed; updating APP_URL"
  if grep -q '^APP_URL=' "$APP/.env.production.local"; then
    sed -i -E "s#^APP_URL=.*#APP_URL=$url#" "$APP/.env.production.local"
  else
    printf 'APP_URL=%s\n' "$url" >> "$APP/.env.production.local"
  fi
  docker restart solange-client-demo-web >/dev/null
  log "web restarted for $url"
}

while :; do
  ensure_running
  reconcile_url
  sleep 60
done
