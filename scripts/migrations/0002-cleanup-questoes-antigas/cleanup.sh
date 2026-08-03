#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"

mongosh "$MONGODB" --quiet --eval '
  // Pré-check: aborta se alguma prova tem questoesNovo vazio mas questoes antigo populado
  const ruins = db.provas.countDocuments({
    questoesNovo: { $in: [null, []] },
    "questoes.0": { $exists: true },
  });
  if (ruins > 0) {
    throw new Error("ABORTA: " + ruins + " provas com questoesNovo vazio mas questoes antigo populado. Rode a migracao 0001 antes.");
  }

  // Prova: derruba o array antigo e renomeia o subdoc
  db.provas.updateMany({}, { $unset: { questoes: "" } });
  db.provas.updateMany({}, { $rename: { questoesNovo: "questoes" } });

  // Simulado: idem
  db.simulados.updateMany({}, { $unset: { questoes: "" } });
  db.simulados.updateMany({}, { $rename: { questoesNovo: "questoes" } });

  // Questao: remove campos legado
  db.questoes.updateMany({}, { $unset: { prova: "", numero: "" } });

  // Índices legados
  try { db.questoes.dropIndex("prova_1"); } catch (e) { print("prova_1 nao existe, ok"); }
  try { db.questoes.dropIndex("numero_1"); } catch (e) { print("numero_1 nao existe, ok"); }

  // Índices reversos finais
  db.provas.createIndex({ "questoes.questao": 1 });
  db.simulados.createIndex({ "questoes.questao": 1 });

  print("cleanup 0002 OK");
'
