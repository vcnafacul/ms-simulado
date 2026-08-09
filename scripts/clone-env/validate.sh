#!/usr/bin/env bash
#
# validate.sh — compara a contagem de documentos por collection entre origem e destino.
# Uso: bash validate.sh <source_uri> <local_uri> [sleep_seconds]
# Roda mongosh em containers na rede CLONE_NETWORK. Exit 0 = ok, 1 = divergência.
set -euo pipefail

SRC_URI="${1:?uso: validate.sh <source_uri> <local_uri> [sleep]}"
LOCAL_URI="${2:?uso: validate.sh <source_uri> <local_uri> [sleep]}"
SLEEP="${3:-1}"
: "${CLONE_NETWORK:=mssimulado-clone-net}"
: "${CLONE_MONGO_IMAGE:=mongo:7}"

# $1 = uri, $2 = sleep_ms entre contagens -> imprime JSON {collection: n}
counts() {
  docker run --rm --network "$CLONE_NETWORK" "$CLONE_MONGO_IMAGE" \
    mongosh "$1" --quiet --eval '
      const s = '"$2"';
      const out = {};
      db.getCollectionNames().sort().forEach(c => {
        out[c] = db.getCollection(c).countDocuments();
        if (s > 0) sleep(s);
      });
      print(JSON.stringify(out));
    '
}

echo "→ Validando contagens (origem vs local)..."
src_json="$(counts "$SRC_URI" "$((SLEEP * 1000))")"
local_json="$(counts "$LOCAL_URI" 0)"

printf "%-28s %10s %10s   %s\n" "collection" "origem" "local" "ok"
fail=0
cols=()
while IFS= read -r line; do cols+=("$line"); done < <(printf '%s\n%s\n' "$src_json" "$local_json" | jq -r 'keys[]' | sort -u)
for c in "${cols[@]}"; do
  s="$(printf '%s' "$src_json"   | jq -r --arg c "$c" '.[$c] // 0')"
  l="$(printf '%s' "$local_json" | jq -r --arg c "$c" '.[$c] // 0')"
  if [ "$s" = "$l" ]; then mark="✓"; else mark="✗"; fail=1; fi
  printf "%-28s %10s %10s   %s\n" "$c" "$s" "$l" "$mark"
done

if [ "$fail" -eq 0 ]; then echo "✅ Validação OK"; exit 0; else echo "❌ Divergência de contagem" >&2; exit 1; fi
