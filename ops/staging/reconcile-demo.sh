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
public_health_ok() {
  # docker:27-cli nao possui curl. O web container usa Node 24, com DNS e TLS
  # verificados pelo fetch nativo. Nao aceitar redirects, HTML ou status 200
  # sem o contrato JSON da API de health.
  case "$1" in
    https://*.trycloudflare.com) ;;
    *) return 1 ;;
  esac
  docker exec "$WEB" node -e '
    (async () => {
      const response = await fetch(process.argv[1], {
        redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (response.status !== 200) { process.exitCode = 1; return; }
      const body = await response.json();
      if (body?.status !== "ok" || typeof body?.buildSha !== "string") {
        process.exitCode = 1;
      }
    })().catch(() => { process.exitCode = 1; });
  ' "$1/api/health" >/dev/null 2>&1
}
report_public_failure() {
  # O erro de autenticacao e extraido dos logs, sem copiar URLs de segredo.
  if docker logs --tail 40 solange-demo-tunnel 2>&1 | grep -qi 'Unauthorized: Tunnel not found'; then
    log 'cloudflared Unauthorized: Tunnel not found; revisar credencial/tunnel pelo canal autorizado'
  else
    log 'tunnel public DNS/TLS/health unavailable; verificar logs e rota publica'
  fi
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
  app_valid || {
    rm -f "$URL_FILE"
    log 'app incomplete; public URL marker invalidated'
    return 0
  }
  url=$(current_tunnel_url)
  [ -n "$url" ] || {
    rm -f "$URL_FILE"
    report_public_failure
    log 'tunnel URL unavailable; public URL marker invalidated'
    return 0
  }
  if ! public_health_ok "$url"; then
    rm -f "$URL_FILE"
    report_public_failure
    log 'URL marker invalidated because public health is unavailable'
    return 0
  fi
  current=$(sed -n 's/^APP_URL=//p' "$APP/.env.production.local" | tail -1)
  marker=$(cat "$URL_FILE" 2>/dev/null || true)
  # Guardar a URL comprovadamente aplicada ao web APOS um restart bem
  # sucedido. APP_URL no arquivo nao prova que a instancia ja a carregou.
  applied_file=${URL_FILE%/*}/applied-url.txt
  applied=$(cat "$applied_file" 2>/dev/null || true)
  if [ "$current" = "$url" ] && [ "$marker" = "$url" ]; then
    # Marker legado valido foi publicado somente apos restart e health.
    [ "$applied" = "$url" ] || printf '%s\n' "$url" > "$applied_file"
    return 0
  fi
  if [ "$current" = "$url" ] && [ "$applied" = "$url" ]; then
    # A configuracao ja foi aplicada: recuperar so o marker apos queda
    # externa, sem reiniciar um web que permanece saudavel.
    printf '%s\n' "$url" > "$URL_FILE"
    log 'public health recovered; URL marker restored without web restart'
    return 0
  fi

  if [ "$current" != "$url" ]; then
    log "tunnel URL changed; updating APP_URL"
    if grep -q '^APP_URL=' "$APP/.env.production.local"; then
      sed -i -E "s#^APP_URL=.*#APP_URL=$url#" "$APP/.env.production.local"
    else
      printf 'APP_URL=%s\n' "$url" >> "$APP/.env.production.local"
    fi
  fi
  if ! docker restart "$WEB" >/dev/null; then
    rm -f "$URL_FILE"
    log 'web restart failed; public URL marker invalidated; retry scheduled'
    return 0
  fi
  if ! public_health_ok "$url"; then
    rm -f "$URL_FILE"
    log 'public health failed after web restart; URL marker invalidated'
    return 0
  fi
  printf '%s\n' "$url" > "$applied_file"
  printf '%s\n' "$url" > "$URL_FILE"
  log "web restarted and public health confirmed for $url"
}

while :; do
  ensure_running
  reconcile_url
  sleep 60
done
