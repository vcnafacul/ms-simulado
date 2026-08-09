#!/usr/bin/env bash
#
# Validação da migração 0002 (file-based). Roda sobre input + output, sem Mongo.
# Uso: bash validate.sh [dir]   (default = diretório atual)
# Requer: provas.json, simulados.json, questoes.json (input) e
#         provas.out.json, simulados.out.json, questoes.out.json (output do cleanup.sh)
# Exit 0 = ok, 1 = falha.
#
# Nota: valida só o rename/limpeza (cleanup.sh). Os índices são criados por
# ./indices.sh (contra o banco) e não entram aqui.
set -euo pipefail

DIR="${1:-.}"
PROVAS_IN="$DIR/provas.json";        SIMULADOS_IN="$DIR/simulados.json"
QUESTOES_IN="$DIR/questoes.json"
PROVAS_OUT="$DIR/provas.out.json";   SIMULADOS_OUT="$DIR/simulados.out.json"
QUESTOES_OUT="$DIR/questoes.out.json"

for f in "$PROVAS_IN" "$SIMULADOS_IN" "$QUESTOES_IN" "$PROVAS_OUT" "$SIMULADOS_OUT" "$QUESTOES_OUT"; do
  [ -f "$f" ] || { echo "❌ Arquivo não encontrado: $f" >&2; exit 1; }
done

fail=0

# [1] Nenhum questoesNovo remanescente na saída
resid_p=$(jq '[ .[] | select(has("questoesNovo")) ] | length' "$PROVAS_OUT")
resid_s=$(jq '[ .[] | select(has("questoesNovo")) ] | length' "$SIMULADOS_OUT")
if [ "$resid_p" = "0" ] && [ "$resid_s" = "0" ]; then
  echo "✓ [1] Nenhum questoesNovo remanescente (provas/simulados)"
else
  echo "✗ [1] questoesNovo remanescente: $resid_p provas, $resid_s simulados" >&2; fail=1
fi

# [2] questoes no shape novo: todo elemento tem .questao
badshape_p=$(jq '[ .[] | .questoes[]? | select(has("questao") | not) ] | length' "$PROVAS_OUT")
badshape_s=$(jq '[ .[] | .questoes[]? | select(has("questao") | not) ] | length' "$SIMULADOS_OUT")
if [ "$badshape_p" = "0" ] && [ "$badshape_s" = "0" ]; then
  echo "✓ [2] questoes no shape subdoc {questao, numero} (provas/simulados)"
else
  echo "✗ [2] elementos fora do shape: $badshape_p provas, $badshape_s simulados" >&2; fail=1
fi

# [3] Rename preservou os dados: sum(out.questoes) == sum(in.questoesNovo)
exp_p=$(jq '[ .[] | (.questoesNovo // []) | length ] | add // 0' "$PROVAS_IN")
got_p=$(jq '[ .[] | (.questoes // []) | length ] | add // 0' "$PROVAS_OUT")
exp_s=$(jq '[ .[] | (.questoesNovo // []) | length ] | add // 0' "$SIMULADOS_IN")
got_s=$(jq '[ .[] | (.questoes // []) | length ] | add // 0' "$SIMULADOS_OUT")
if [ "$exp_p" = "$got_p" ] && [ "$exp_s" = "$got_s" ]; then
  echo "✓ [3] Dados preservados: provas $got_p entries, simulados $got_s entries"
else
  echo "✗ [3] Divergência: provas $got_p (esperado $exp_p), simulados $got_s (esperado $exp_s)" >&2; fail=1
fi

# [4] questoes.out.json: nenhum campo `prova` remanescente (foi renomeado)
resid_prova=$(jq '[ .[] | select(has("prova")) ] | length' "$QUESTOES_OUT")
if [ "$resid_prova" = "0" ]; then
  echo "✓ [4] Nenhuma questao com campo legado prova remanescente"
else
  echo "✗ [4] $resid_prova questoes ainda com campo prova" >&2; fail=1
fi

# [5] numero só existe acompanhado de provaBase (sem provaBase => sem numero)
num_orfao=$(jq '[ .[] | select((.numero != null) and (.provaBase == null)) ] | length' "$QUESTOES_OUT")
if [ "$num_orfao" = "0" ]; then
  echo "✓ [5] Nenhum numero orfao (todo numero tem provaBase)"
else
  echo "✗ [5] $num_orfao questoes com numero sem provaBase" >&2; fail=1
fi

# [6] Rename preservou o vínculo: #provaBase(out) == #prova não-nula(in)
exp_base=$(jq '[ .[] | select(.prova != null) ] | length' "$QUESTOES_IN")
got_base=$(jq '[ .[] | select(.provaBase != null) ] | length' "$QUESTOES_OUT")
if [ "$exp_base" = "$got_base" ]; then
  echo "✓ [6] provaBase preservado: $got_base questoes (prova->provaBase)"
else
  echo "✗ [6] Divergência provaBase: $got_base (esperado $exp_base)" >&2; fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✅ validate 0002 OK"; exit 0
else
  echo "❌ Validação falhou"; exit 1
fi
