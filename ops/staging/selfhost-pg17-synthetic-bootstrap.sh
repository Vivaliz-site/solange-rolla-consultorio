#!/bin/sh
# Reconciliacao OPCIONAL de bootstrap PostgreSQL 17 SINTETICO isolado.
# Nao utilizar na origem Supabase gerenciada, em banco clinico ou no cutover.
# Uso: sh ops/staging/selfhost-pg17-synthetic-bootstrap.sh solange-syn-<id>-db
# Requer projeto Compose de nome solangesyn* e nenhuma porta publicada.
set -eu

container="$1"
case "$container" in
  solange-syn-*-db) ;;
  *) echo "Uso exclusivo para container efemero solange-syn-*-db" >&2; exit 2 ;;
esac

docker_cmd() { sudo -n docker "$@"; }

project=$(docker_cmd inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container")
case "$project" in
  solangesyn*) ;;
  *) echo "Projeto Compose nao corresponde ao ensaio sintetico" >&2; exit 2 ;;
esac
ports=$(docker_cmd inspect --format '{{json .HostConfig.PortBindings}}' "$container")
case "$ports" in
  ""|"null"|"{}") ;;
  *) echo "Ensaio invalido: container publica portas" >&2; exit 2 ;;
esac

role_query="SELECT count(*) FROM pg_authid WHERE rolname IN ('authenticator','supabase_auth_admin','supabase_storage_admin') AND rolpassword IS NOT NULL"
before=$(docker_cmd exec "$container" psql -X -qAt -U postgres -d postgres -c "$role_query")
case "$before" in
  0|1|2|3) ;;
  *) echo "Readback inesperado dos roles" >&2; exit 1 ;;
esac
printf 'ROLE_HASHES_ANTES=%s/3\n' "$before"

# No teste da imagem PG17 os roles nasceram sem senha SCRAM. Login localhost
# usa trust e NAO prova conectividade de Auth/PostgREST/Storage.
docker_cmd exec "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /docker-entrypoint-initdb.d/init-scripts/99-roles.sql >/dev/null

# No ensaio, funcoes auth.* de JWT pertenciam a postgres, impedindo a
# migracao inicial GoTrue (SQLSTATE 42501). Mudar SOMENTE este sandbox.
docker_cmd exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'auth'
       AND p.proname IN ('uid','role','email')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', r.assinatura);
  END LOOP;
END
$do$;
SQL

after=$(docker_cmd exec "$container" psql -X -qAt -U postgres -d postgres -c "$role_query")
if [ "$after" != "3" ]; then
  echo "Falha na reconciliacao de roles do ensaio" >&2
  exit 1
fi

owner_query="SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='auth' AND p.proname IN ('uid','role','email') AND pg_get_userbyid(p.proowner)='supabase_auth_admin'"
owner_count=$(docker_cmd exec "$container" psql -X -qAt -U postgres -d postgres -c "$owner_query")
if [ "$owner_count" != "3" ]; then
  echo "Falha no ownership de funcoes Auth do ensaio" >&2
  exit 1
fi

# Verificar pela rede SCRAM, nao via 127.0.0.1 (trust).
if ! docker_cmd exec "$container" sh -c \
  'host=$(hostname -i | awk "{print \$1}"); PGPASSWORD="$POSTGRES_PASSWORD" psql -X -w -h "$host" -U supabase_auth_admin -d postgres -qAtc "SELECT 1" >/dev/null 2>&1'; then
  echo "Login SCRAM remoto do ensaio falhou" >&2
  exit 1
fi
printf 'ROLE_HASHES_DEPOIS=3/3\nAUTH_FUNCTION_OWNERS=3/3\nSCRAM_REMOTE=PASS\n'
