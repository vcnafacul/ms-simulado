#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB:?defina MONGODB}"

mongosh "$MONGODB" --quiet --eval '
  const comLegado = db.questoes.countDocuments({
    $or: [ { prova: { $exists: true } }, { numero: { $exists: true } } ],
  });
  if (comLegado > 0) throw new Error("FALHA: " + comLegado + " questoes ainda com prova/numero");

  const comNovo =
    db.provas.countDocuments({ questoesNovo: { $exists: true } }) +
    db.simulados.countDocuments({ questoesNovo: { $exists: true } });
  if (comNovo > 0) throw new Error("FALHA: ainda existe questoesNovo em provas/simulados");

  const provaShapeRuim = db.provas.countDocuments({
    "questoes.0": { $exists: true },
    "questoes.questao": { $exists: false },
  });
  if (provaShapeRuim > 0) throw new Error("FALHA: " + provaShapeRuim + " provas com questoes fora do shape subdoc");

  print("validate 0002 OK");
'
