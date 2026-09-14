#!/usr/bin/env bash
#
# Migração 0003 — Categoria por dono.
#
# Conecta ao Mongo: índice não sai em mongoexport nem entra em mongoimport, e
# por isso esta migração não segue o modelo file-based das 0001/0002.
#
# ⚠️ Rodar ANTES do deploy do ms, em cada ambiente. A ordem não é preferência:
# o `delete` e a fábrica de prova comparam `dono` com igualdade estrita, e uma
# categoria sem o campo (`undefined`) não casa com `'system'`. Subir o ms antes
# deixa toda categoria existente indeletável até pelo admin, e faz prova de ENEM
# nascer com 1 simulado no lugar de 5 — as duas coisas em silêncio.
#
# Uso: MONGODB='mongodb://localhost:27017/simulado' bash migrar.sh
#
# Idempotente: rodar duas vezes dá o mesmo resultado.
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"

mongosh "$MONGODB" --quiet --eval '
  // ---- 1. Backfill do dono. TEM que vir antes do índice: criar o composto
  // com documentos sem `dono` põe todos eles disputando a mesma chave.
  const semDono = db.categorias.updateMany(
    { dono: { $exists: false } },
    { $set: { dono: "system" } },
  );
  print("dono=system em " + semDono.modifiedCount + " categorias");

  // ---- 2. Backfill de `deleted`. O índice novo é parcial sobre
  // `{ deleted: false }`; documento sem o campo ficaria FORA do índice e
  // escaparia da unicidade — em silêncio.
  const semDeleted = db.categorias.updateMany(
    { deleted: { $exists: false } },
    { $set: { deleted: false } },
  );
  print("deleted=false em " + semDeleted.modifiedCount + " categorias");

  // ---- 3. Pré-check: duplicata (dono, nome) entre as VIVAS impede o unique.
  const dups = db.categorias.aggregate([
    { $match: { deleted: false } },
    { $group: { _id: { dono: "$dono", nome: "$nome" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  if (dups.length > 0) {
    print("ABORTADO: duplicatas (dono, nome) entre as vivas:");
    printjson(dups);
    quit(1);
  }

  // ---- 4. Dropar o unique global. autoIndex NÃO remove índice que saiu do
  // schema: sem este drop o unique de `nome` continua valendo no servidor e o
  // cursinho segue impedido de criar "Enem Dia 1" — sem erro em lugar nenhum,
  // porque o código novo está certo.
  try { db.categorias.dropIndex("nome_1"); print("drop nome_1 ok"); }
  catch (e) { print("nome_1 nao existe, ok"); }

  // ---- 5. O composto parcial.
  db.categorias.createIndex(
    { dono: 1, nome: 1 },
    { unique: true, partialFilterExpression: { deleted: false }, name: "dono_nome_unico" },
  );

  // ---- 6. Verificação: o que ficou.
  const nomes = db.categorias.getIndexes().map(i => i.name);
  print("indices: " + nomes.join(", "));
  if (nomes.includes("nome_1")) { print("ABORTADO: nome_1 ainda existe"); quit(1); }
  if (!nomes.includes("dono_nome_unico")) { print("ABORTADO: dono_nome_unico nao criado"); quit(1); }

  // ---- 7. Nenhuma categoria pode ficar sem dono.
  const orfas = db.categorias.countDocuments({ dono: { $exists: false } });
  if (orfas > 0) { print("ABORTADO: " + orfas + " categorias sem dono"); quit(1); }

  print("migracao 0003 OK");
'
