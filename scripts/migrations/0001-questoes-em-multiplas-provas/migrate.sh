#!/usr/bin/env bash
#
# Migração 0001 — Questão Multi-Prova (Fase 2).
# Popula Prova.questoesNovo e Simulado.questoesNovo a partir do modelo antigo
# (Questao.prova + Questao.numero). Arrays antigos ("questoes") intactos.
#
# Uso:  bash migrate.sh [dir]   (dir default = diretório atual)
# Entrada (mongoexport --jsonArray, Extended JSON):
#   <dir>/questoes.json  <dir>/provas.json  <dir>/simulados.json
# Saída:
#   <dir>/provas.out.json  <dir>/simulados.out.json
#
# Idempotente: sobrescreve questoesNovo. Não conecta ao Mongo.
set -euo pipefail

DIR="${1:-.}"
QUESTOES="$DIR/questoes.json"
PROVAS="$DIR/provas.json"
SIMULADOS="$DIR/simulados.json"

for f in "$QUESTOES" "$PROVAS" "$SIMULADOS"; do
  [ -f "$f" ] || { echo "❌ Arquivo não encontrado: $f" >&2; exit 1; }
done

# Gera N ObjectIds (24-hex) como array JSON de strings.
gen_ids() {
  n="$1"
  if [ "$n" -eq 0 ]; then echo "[]"; return; fi
  i=0
  while [ "$i" -lt "$n" ]; do
    openssl rand -hex 12
    i=$((i + 1))
  done | jq -R . | jq -s .
}

# ============ PROVA ============
nq=$(jq '[.[] | select(.prova != null and (.numero != null))] | length' "$QUESTOES")
echo "[STEP 1] Questoes com prova+numero: $nq" >&2
prova_ids=$(gen_ids "$nq")

jq -n \
  --slurpfile questoes "$QUESTOES" \
  --slurpfile provas "$PROVAS" \
  --argjson idpool "$prova_ids" '
  ($questoes[0]) as $qs
  | ($provas[0]) as $ps
  | ( [ $qs[]
        | select(.prova != null and (.numero != null))
        | { provaId: (.prova | if type == "object" then .["$oid"] else . end), questao: {"$oid": ._id["$oid"]}, numero: .numero } ]
      | to_entries
      | map(.value + { _id: {"$oid": $idpool[.key]} }) ) as $entries
  | ( $entries
      | group_by(.provaId)
      | map({ key: .[0].provaId, value: (map({_id, questao, numero})) })
      | from_entries ) as $byProva
  | $ps | map(.questoesNovo = ($byProva[._id["$oid"]] // []))
' > "$DIR/provas.out.json"

total_prova=$(jq '[.[] | .questoesNovo | length] | add // 0' "$DIR/provas.out.json")
echo "[STEP 2] Entries em provas.out.json: $total_prova" >&2

orfas=$(jq -n --slurpfile q "$QUESTOES" --slurpfile p "$PROVAS" '
  ($p[0] | map(._id["$oid"])) as $ids
  | [ $q[0][]
      | select(.prova != null and (.numero != null))
      | select(((.prova | if type == "object" then .["$oid"] else . end)) as $pid | ($ids | index($pid)) | not) ] | length')
echo "[STEP 2b] Questoes órfãs (prova fora do dump): $orfas" >&2

# ============ SIMULADO ============
ns=$(jq -n --slurpfile q "$QUESTOES" --slurpfile s "$SIMULADOS" '
  ($q[0] | map(select(.numero != null)) | INDEX(._id["$oid"])) as $qidx
  | [ $s[0][] | (.questoes // [])[] | .["$oid"] | select($qidx[.] != null) ] | length')
echo "[STEP 3] Refs de simulado com numero: $ns" >&2
sim_ids=$(gen_ids "$ns")

jq -n \
  --slurpfile questoes "$QUESTOES" \
  --slurpfile simulados "$SIMULADOS" \
  --argjson idpool "$sim_ids" '
  ($questoes[0] | map(select(.numero != null)) | INDEX(._id["$oid"])) as $qidx
  | ($simulados[0]) as $ss
  | ( [ $ss | to_entries[]
        | .key as $si | .value as $sim
        | ($sim.questoes // [])[]
        | .["$oid"] as $ref
        | select($qidx[$ref] != null)
        | { si: $si, questao: {"$oid": $ref}, numero: $qidx[$ref].numero } ]
      | to_entries
      | map(.value + { _id: {"$oid": $idpool[.key]} }) ) as $entries
  | ( $entries
      | group_by(.si)
      | map({ key: (.[0].si | tostring), value: (map({_id, questao, numero})) })
      | from_entries ) as $bySim
  | [ $ss | to_entries[]
      | .value + { questoesNovo: ($bySim[(.key | tostring)] // []) } ]
' > "$DIR/simulados.out.json"

total_sim=$(jq '[.[] | .questoesNovo | length] | add // 0' "$DIR/simulados.out.json")
echo "[STEP 3b] Entries em simulados.out.json: $total_sim" >&2

echo "[DONE] provas.out.json ($total_prova entries), simulados.out.json ($total_sim entries)." >&2
