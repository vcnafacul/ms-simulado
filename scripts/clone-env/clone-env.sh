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

# Carrega KEY=VALUE do .env sem sobrescrever o que já veio do ambiente.
load_env() {
  local env_file="${ENV_FILE:-$REPO_ROOT/.env}"
  [ -f "$env_file" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue;; esac
    key="${line%%=*}"; val="${line#*=}"
    key="${key#export }"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -z "$key" ] && continue
    if [ -z "${!key:-}" ]; then export "$key=$val"; fi
  done < "$env_file"
}

mask_uri() { printf '%s' "$1" | sed -E 's#(://[^:/@]+):[^@]*@#\1:***@#'; }

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
    localhost*|127.0.0.1*|0.0.0.0*|*:"$CLONE_PORT")
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
  load_env
  parse_source
  guard_not_local
  confirm
  echo "TODO: dump/restore/validate (próximas tasks)"
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then main "$@"; fi
