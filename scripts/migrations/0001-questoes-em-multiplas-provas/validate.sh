#!/usr/bin/env bash
#
# Validação da migração 0001. Roda sobre os JSONs (input + output), sem Mongo.
# Uso: bash validate.sh [dir]   (default = diretório atual)
# Requer: questoes.json, provas.out.json, simulados.out.json
# Exit 0 = ok, 1 = falha.
set -euo pipefail

DIR="${1:-.}"
QUESTOES="$DIR/questoes.json"
PROVAS_OUT="$DIR/provas.out.json"
SIMULADOS_OUT="$DIR/simulados.out.json"

for f in "$QUESTOES" "$PROVAS_OUT" "$SIMULADOS_OUT"; do
  [ -f "$f" ] || { echo "❌ Arquivo não encontrado: $f" >&2; exit 1; }
done

fail=0

# [1] Total estrito: sum(prova.questoesNovo) == count(questoes com prova+numero
#     cuja prova EXISTE no dump). Órfãs (prova fora do dump) são descontadas —
#     elas têm prova+numero mas corretamente não entram em nenhum questoesNovo.
expected=$(jq -n --slurpfile q "$QUESTOES" --slurpfile p "$PROVAS_OUT" '
  ($p[0] | map(._id["$oid"])) as $ids
  | [ $q[0][] | select(.prova != null and (.numero != null))
      | select((.prova["$oid"]) as $pid | ($ids | index($pid))) ] | length')
got=$(jq '[.[] | .questoesNovo | length] | add // 0' "$PROVAS_OUT")
if [ "$expected" = "$got" ]; then
  echo "✓ [1] Total prova entries = $got (esperado $expected)"
else
  echo "✗ [1] Total prova entries = $got, esperado $expected" >&2; fail=1
fi

# [2] Idiomáticas preservadas: nº de grupos (prova,numero) com >=2 igual input vs output
exp_pairs=$(jq -n --slurpfile q "$QUESTOES" '
  [ $q[0][] | select(.prova != null and (.numero != null))
    | (.prova["$oid"] + "|" + (.numero | tostring)) ]
  | group_by(.) | map(select(length >= 2)) | length')
got_pairs=$(jq '
  [ .[] | (.questoesNovo // [])
    | group_by(.numero) | map(select(length >= 2)) | length ] | add // 0' "$PROVAS_OUT")
if [ "$exp_pairs" = "$got_pairs" ]; then
  echo "✓ [2] Grupos idiomáticos (>=2 mesmo numero) = $got_pairs"
else
  echo "✗ [2] Idiomáticas: esperado $exp_pairs grupos, obtido $got_pairs" >&2; fail=1
fi

# [3] Simulado: questoesNovo.length == count(refs com numero!=null)
sim_bad=$(jq -n --slurpfile q "$QUESTOES" --slurpfile s "$SIMULADOS_OUT" '
  ($q[0] | map(select(.numero != null)) | INDEX(._id["$oid"])) as $qidx
  | [ $s[0][]
      | ( [ (.questoes // [])[] | .["$oid"] | select($qidx[.] != null) ] | length ) as $exp
      | select((.questoesNovo | length) != $exp)
      | ._id["$oid"] ]')
sim_bad_count=$(echo "$sim_bad" | jq 'length')
if [ "$sim_bad_count" = "0" ]; then
  echo "✓ [3] Todos os simulados com questoesNovo.length correto"
else
  echo "✗ [3] $sim_bad_count simulados com contagem errada: $(echo "$sim_bad" | jq -c '.[0:5]')" >&2; fail=1
fi

# [4] Órfãs (warn, não falha)
orfas=$(jq -n --slurpfile q "$QUESTOES" --slurpfile p "$PROVAS_OUT" '
  ($p[0] | map(._id["$oid"])) as $ids
  | [ $q[0][] | select(.prova != null and (.numero != null))
      | select((.prova["$oid"]) as $pid | ($ids | index($pid)) | not) ] | length')
echo "ℹ [4] Questoes órfãs (prova fora do dump): $orfas (warn)"

if [ "$fail" -eq 0 ]; then
  echo "✅ Validação OK"; exit 0
else
  echo "❌ Validação falhou"; exit 1
fi
