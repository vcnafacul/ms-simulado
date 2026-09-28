#!/usr/bin/env bash
#
# Migração 0005 — `teveSucessora` nas questões que já têm versão mais nova
# (tickets/023, card 18).
#
# Desde o card 18, "tem versão mais nova" é o campo `teveSucessora`, e não mais
# `congelada` (a original pode seguir viva em provas com versões fixas). As
# questões que já foram versionadas antes disso precisam do campo, senão o
# "Buscar atualizações" (card 19) não as enxerga e uma 2ª versão viraria galho.
#
# Marca `true` em toda questão que é `origem` de outra com `tipoOrigem: versao`.
# Não mexe em `congelada`.
#
# Uso: MONGODB='mongodb://localhost:27017/simulado' bash migrar.sh
#
# Idempotente: o filtro só pega quem ainda não tem `teveSucessora: true`.
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"

mongosh "$MONGODB" --quiet --eval '
  // `origem` é string (o _id da original).
  const origens = db.questaos.distinct("origem", { tipoOrigem: "versao", origem: { $ne: null } });
  const ids = origens
    .filter((o) => /^[0-9a-fA-F]{24}$/.test(String(o)))
    .map((o) => ObjectId(String(o)));
  print("originais com versão: " + ids.length);

  const r = db.questaos.updateMany(
    { _id: { $in: ids }, teveSucessora: { $ne: true } },
    { $set: { teveSucessora: true } },
  );
  print("teveSucessora=true em " + r.modifiedCount + " questões");

  const faltando = db.questaos.countDocuments({ _id: { $in: ids }, teveSucessora: { $ne: true } });
  if (faltando > 0) { print("ABORTADO: " + faltando + " ainda sem o campo"); quit(1); }
  print("migracao 0005 OK");
'
