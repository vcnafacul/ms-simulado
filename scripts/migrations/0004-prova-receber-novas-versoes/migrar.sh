#!/usr/bin/env bash
#
# Migração 0004 — `receberNovasVersoes` nas provas que já existem
# (tickets/023, card 05).
#
# ⚠️ Rodar ANTES do deploy do ms, em cada ambiente. O código novo declara o
# campo com `default: false`, e o Mongoose aplica o default ao LER um
# documento sem o campo: sem esta migração, toda prova antiga seria lida como
# "travada" — e regravada assim no próximo save —, o contrário do decidido
# (as que já existem continuam recebendo versões, como hoje). E o card 06
# filtra no banco (`receberNovasVersoes: true`), que não vê o default.
#
# Uso: MONGODB='mongodb://localhost:27017/simulado' bash migrar.sh
#
# Idempotente: o filtro por `$exists: false` só pega quem ainda não tem o campo.
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"

mongosh "$MONGODB" --quiet --eval '
  const total = db.provas.countDocuments({});
  const antes = db.provas.countDocuments({ receberNovasVersoes: { $exists: false } });
  print("provas: " + total + " | sem o campo antes: " + antes);

  const r = db.provas.updateMany(
    { receberNovasVersoes: { $exists: false } },
    { $set: { receberNovasVersoes: true } },
  );
  print("receberNovasVersoes=true em " + r.modifiedCount + " provas");

  const depois = db.provas.countDocuments({ receberNovasVersoes: { $exists: false } });
  if (depois > 0) { print("ABORTADO: " + depois + " provas ainda sem o campo"); quit(1); }
  print("com true: " + db.provas.countDocuments({ receberNovasVersoes: true }) +
        " | com false: " + db.provas.countDocuments({ receberNovasVersoes: false }));
  print("migracao 0004 OK");
'
