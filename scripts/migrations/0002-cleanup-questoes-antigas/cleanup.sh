#!/usr/bin/env bash
#
# Migração 0002 — Cleanup Questões Antigas (Etapa 9, final). FILE-BASED.
# Espelha o modelo da 0001: NÃO conecta ao Mongo, opera sobre JSON exportado.
#
# Renomeia questoesNovo -> questoes (dropando o array antigo de refs) em
# provas/simulados. Em questoes, renomeia `prova` -> `provaBase` (ponteiro pra
# prova de origem) e REMOVE `numero` — número vive só no relacionamento
# (Prova.questoes[].numero). No dash, casa-se `provaBase` com `provasContendo`
# pra obter prova+número. Questão sem prova fica sem provaBase.
#
# A derrubada/criação de índices (que EXIGE conexão ao banco — não dá pra fazer
# em arquivo) fica no script separado ./indices.sh, rodado por ÚLTIMO, depois de
# reimportar os .out.json.
#
# Uso:  bash cleanup.sh [dir]   (dir default = diretório atual)
# Entrada (mongoexport --jsonArray, Extended JSON):
#   <dir>/provas.json  <dir>/simulados.json  <dir>/questoes.json
# Saída:
#   <dir>/provas.out.json  <dir>/simulados.out.json  <dir>/questoes.out.json
#
# Idempotente sobre o mesmo input: reescreve os .out.json, sem tocar nos .json
# de entrada. Rodar 2x sobre o mesmo dump = mesmo resultado.
set -euo pipefail

DIR="${1:-.}"
PROVAS="$DIR/provas.json"
SIMULADOS="$DIR/simulados.json"
QUESTOES="$DIR/questoes.json"

for f in "$PROVAS" "$SIMULADOS" "$QUESTOES"; do
  [ -f "$f" ] || { echo "❌ Arquivo não encontrado: $f" >&2; exit 1; }
done

# ---- Pré-check: aborta se a 0001 não rodou (ou se o dump já foi migrado).
# Sinal de estado ruim: questoesNovo vazio/ausente MAS questoes antigo populado.
precheck() {
  jq '[ .[] | select((.questoesNovo // [] | length) == 0 and ((.questoes // []) | length) > 0) ] | length' "$1"
}
provas_ruins=$(precheck "$PROVAS")
simulados_ruins=$(precheck "$SIMULADOS")
if [ "$provas_ruins" -ne 0 ] || [ "$simulados_ruins" -ne 0 ]; then
  echo "❌ ABORTA: $provas_ruins provas e $simulados_ruins simulados com questoesNovo vazio mas questoes antigo populado." >&2
  echo "   Rode a migração 0001 (e reimporte) antes — ou este dump não reflete o estado pós-0001." >&2
  echo "   Se o banco JÁ foi migrado (questoes no shape novo, sem questoesNovo), NÃO rode de novo." >&2
  exit 1
fi

# ---- PROVAS: questoes := questoesNovo ; remove questoesNovo
jq 'map(.questoes = (.questoesNovo // []) | del(.questoesNovo))' "$PROVAS" > "$DIR/provas.out.json"
np=$(jq 'length' "$DIR/provas.out.json")
echo "[STEP 1] provas.out.json: $np docs (questoes := questoesNovo)" >&2

# ---- SIMULADOS: idem
jq 'map(.questoes = (.questoesNovo // []) | del(.questoesNovo))' "$SIMULADOS" > "$DIR/simulados.out.json"
ns=$(jq 'length' "$DIR/simulados.out.json")
echo "[STEP 2] simulados.out.json: $ns docs (questoes := questoesNovo)" >&2

# ---- QUESTOES: renomeia prova -> provaBase (ponteiro) e REMOVE numero.
#      numero vive só no relacionamento (Prova.questoes[].numero).
jq 'map((if (.prova != null) then .provaBase = .prova else . end) | del(.prova, .numero))' "$QUESTOES" > "$DIR/questoes.out.json"
nq=$(jq 'length' "$DIR/questoes.out.json")
comBase=$(jq '[ .[] | select(.provaBase != null) ] | length' "$DIR/questoes.out.json")
echo "[STEP 3] questoes.out.json: $nq docs ($comBase com provaBase; prova->provaBase, numero removido)" >&2

echo "[DONE] provas.out.json, simulados.out.json, questoes.out.json gerados." >&2
echo "cleanup 0002 OK" >&2
