#!/usr/bin/env bash
#
# Migração 0002 — passo FINAL: índices.
# ÚNICO passo que conecta ao Mongo — criar/derrubar índice não dá pra fazer em
# arquivo (não sai no mongoexport nem entra no mongoimport).
#
# Rodar por ÚLTIMO, DEPOIS de reimportar provas.out.json / simulados.out.json /
# questoes.out.json (gerados por cleanup.sh + validados por validate.sh).
#
# Uso: MONGODB='mongodb://localhost:27017/simulado' bash indices.sh
#
# Idempotente: dropIndex ignora índice inexistente; createIndex é no-op se o
# índice já existe com a mesma spec.
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"

mongosh "$MONGODB" --quiet --eval '
  // Índices legados (do modelo antigo Questao.prova / Questao.numero)
  try { db.questoes.dropIndex("prova_1");  print("drop prova_1 ok"); }  catch (e) { print("prova_1 nao existe, ok"); }
  try { db.questoes.dropIndex("numero_1"); print("drop numero_1 ok"); } catch (e) { print("numero_1 nao existe, ok"); }

  // Índices reversos finais: lookup questao -> provas/simulados que a contêm
  db.provas.createIndex({ "questoes.questao": 1 });
  db.simulados.createIndex({ "questoes.questao": 1 });

  print("indices 0002 OK");
'
