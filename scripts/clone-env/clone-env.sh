#!/usr/bin/env bash
#
# clone-env.sh — Clona um ambiente Mongo remoto (homol/prod) para um Mongo LOCAL
# isolado em Docker, para desenvolvimento. A origem é SEMPRE read-only (mongodump).
#
# Uso:
#   npm run clone:env                 # lê .env, confirma, clona
#   npm run clone:env -- --yes        # pula confirmação
#   npm run clone:env -- --keep-dump  # mantém o archive.gz
#   npm run clone:env -- --no-validate
#
# Requer: Docker + jq. Nenhuma tool Mongo no host (roda tudo em containers mongo:7).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ---- defaults (sobrescrevíveis por env/.env) ----
: "${CLONE_CONTAINER_NAME:=mssimulado-clone}"
: "${CLONE_PORT:=27018}"
: "${CLONE_NETWORK:=mssimulado-clone-net}"
: "${CLONE_MONGO_IMAGE:=mongo:7}"
: "${SLEEP_BETWEEN_OPS:=1}"

# ---- flags ----
ASSUME_YES=0
KEEP_DUMP=0
RUN_VALIDATE=1

# Rede de segurança: em qualquer saída, remove o dump temporário (salvo --keep-dump).
cleanup_on_exit() { [ "$KEEP_DUMP" -eq 1 ] && return 0; [ -n "${DUMP_DIR:-}" ] && rm -rf "$DUMP_DIR"; return 0; }
trap cleanup_on_exit EXIT

# Carrega KEY=VALUE do .env sem sobrescrever o que já veio do ambiente.
load_env() {
  local env_file="${ENV_FILE:-$REPO_ROOT/.env}"
  [ -f "$env_file" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"   # left-trim
    case "$line" in ''|\#*) continue;; esac
    key="${line%%=*}"; val="${line#*=}"
    key="${key#export }"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [ -z "${!key:-}" ]; then export "$key=$val"; fi
  done < "$env_file"
}

# A partir de SOURCE_MONGODB popula: SRC_HOST, SRC_DB, SRC_BASE_URI (URI sem o db).
parse_source() {
  : "${SOURCE_MONGODB:?defina SOURCE_MONGODB no .env (URI do ambiente remoto, read-only)}"
  SRC_HOST="$(printf '%s' "$SOURCE_MONGODB" | sed -E 's#^mongodb(\+srv)?://##; s#^[^@]*@##; s#[/?].*$##')"
  local rest
  rest="$(printf '%s' "$SOURCE_MONGODB" | sed -E 's#^mongodb(\+srv)?://[^/]*##')"
  rest="${rest#/}"
  SRC_DB="${rest%%\?*}"
  if [ -z "$SRC_DB" ]; then
    echo "❌ SOURCE_MONGODB não especifica o database no path (ex: .../simulado)." >&2
    exit 1
  fi
  local scheme_authority query
  scheme_authority="$(printf '%s' "$SOURCE_MONGODB" | sed -E 's#^(mongodb(\+srv)?://[^/]*).*#\1#')"
  case "$SOURCE_MONGODB" in *\?*) query="?${SOURCE_MONGODB#*\?}";; *) query="";; esac
  SRC_BASE_URI="${scheme_authority}/${query}"
}

# Recusa origem local (evita clonar local->local ou confundir origem com destino).
guard_not_local() {
  case "$SRC_HOST" in
    localhost*|LOCALHOST*|127.*|0.0.0.0*|::1|\[::1\]*|host.docker.internal*|*:"$CLONE_PORT")
      echo "❌ SOURCE_MONGODB aponta para host local ($SRC_HOST). A origem deve ser remota (homol/prod)." >&2
      exit 1;;
  esac
}

confirm() {
  echo "⚠️  Origem  (READ-ONLY): $SRC_HOST / db \"$SRC_DB\""
  echo "    Destino (RECRIADO):  mongodb://localhost:$CLONE_PORT  (container \"$CLONE_CONTAINER_NAME\")"
  if [ "$ASSUME_YES" -eq 1 ]; then echo "    (--yes) prosseguindo..."; return 0; fi
  printf "    Confirmar clone? [y/N] "
  read -r ans
  case "$ans" in y|Y|yes|YES|sim|SIM) ;; *) echo "Abortado."; exit 1;; esac
}

do_dump() {
  DUMP_DIR="$(mktemp -d "$REPO_ROOT/.clone-env-dump-XXXXXX")"
  echo "→ Dump da origem (mongodump, read-only) — db \"$SRC_DB\"..."
  sleep "$SLEEP_BETWEEN_OPS"
  # --entrypoint mongodump: evita o gosu do entrypoint da imagem mongo (que dropa
  # para o usuário "mongodb" e não consegue escrever no bind-mount do Docker Desktop).
  docker run --rm --network "$CLONE_NETWORK" -v "$DUMP_DIR:/dump" \
    --entrypoint mongodump "$CLONE_MONGO_IMAGE" \
    --uri="$SRC_BASE_URI" --db="$SRC_DB" --archive=/dump/archive.gz --gzip
  echo "  dump em $DUMP_DIR/archive.gz"
}

recreate_local() {
  echo "→ Recriando Mongo local (wipe & reload)..."
  docker rm -f "$CLONE_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker volume rm "${CLONE_CONTAINER_NAME}-data" >/dev/null 2>&1 || true
  docker run -d --name "$CLONE_CONTAINER_NAME" --network "$CLONE_NETWORK" \
    -p "$CLONE_PORT:27017" -v "${CLONE_CONTAINER_NAME}-data:/data/db" \
    "$CLONE_MONGO_IMAGE" >/dev/null
  printf "  aguardando o Mongo local subir"
  local tries=0
  until docker exec "$CLONE_CONTAINER_NAME" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
      echo "" >&2
      echo "❌ Mongo local não ficou pronto após 60s. Veja: docker logs $CLONE_CONTAINER_NAME" >&2
      exit 1
    fi
    printf "."; sleep 1
  done
  echo " ok"
}

do_restore() {
  echo "→ Restore no Mongo local..."
  docker run --rm --network "$CLONE_NETWORK" -v "$DUMP_DIR:/dump" "$CLONE_MONGO_IMAGE" \
    mongorestore --uri="mongodb://$CLONE_CONTAINER_NAME:27017" \
    --archive=/dump/archive.gz --gzip --drop
}

cleanup_dump() {
  if [ "$KEEP_DUMP" -eq 1 ]; then
    echo "ℹ dump mantido em: $DUMP_DIR/archive.gz"
  else
    rm -rf "$DUMP_DIR"
  fi
}

main() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --yes) ASSUME_YES=1;;
      --keep-dump) KEEP_DUMP=1;;
      --no-validate) RUN_VALIDATE=0;;
      *) echo "flag desconhecida: $arg" >&2; exit 1;;
    esac
  done
  command -v docker >/dev/null || { echo "❌ Docker não encontrado." >&2; exit 1; }
  command -v jq >/dev/null || { echo "❌ jq não encontrado." >&2; exit 1; }
  load_env
  parse_source
  guard_not_local
  confirm
  docker network create "$CLONE_NETWORK" >/dev/null 2>&1 || true
  do_dump
  recreate_local
  do_restore
  if [ "$RUN_VALIDATE" -eq 1 ]; then
    bash "$SCRIPT_DIR/validate.sh" \
      "$SOURCE_MONGODB" \
      "mongodb://$CLONE_CONTAINER_NAME:27017/$SRC_DB" \
      "$SLEEP_BETWEEN_OPS"
  fi
  cleanup_dump
  echo ""
  echo "✅ Clone pronto."
  echo "   Aponte o ms-simulado para o clone editando o .env:"
  echo "     MONGODB=mongodb://localhost:$CLONE_PORT/$SRC_DB"
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then main "$@"; fi
