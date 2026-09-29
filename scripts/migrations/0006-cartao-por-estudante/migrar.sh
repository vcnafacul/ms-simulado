#!/usr/bin/env bash
#
# Migração 0006 — índice `cartao_por_estudante` (um cartão por estudante).
#
# O schema declara o índice único { usuario, simulado, cartaoCode } (parcial em
# `cartaoCode` string), e o `autoIndex` tenta criá-lo no boot do ms. Se o banco
# JÁ TEM duplicados (envios de antes da correção e711453), a criação falha e
# só vai para o log — e sem índice, dois envios quase juntos passam os dois.
# Foi o que o QA achou em homol (2026-09-28).
#
# Uso:
#   MONGODB='mongodb://...' bash migrar.sh            # só LISTA (não escreve nada)
#   MONGODB='mongodb://...' bash migrar.sh --aplicar  # resolve (sem apagar) e cria o índice
#   MONGODB='mongodb://...' bash migrar.sh --excluir  # resolve APAGANDO e cria o índice
#
# Em cada grupo duplicado fica UM histórico com o cartão —
# o de leitura concluída (`completed`); empate: o mais recente — e os outros
# perdem o `cartaoCode`, que vai para `cartaoCodeDuplicado`, com `duplicadoDe`
# apontando o que ficou. Isso os tira do índice parcial sem perder dado, e é
# reversível (ver o README). Com `--excluir` (homol, decisão do Fernando em
# 2026-09-28), os outros são APAGADOS, junto com o vínculo deles no relatório
# do cursinho (`relatoriosimuladoestudantes`) — sem volta.
#
# Idempotente: rodar de novo não acha duplicados e só confere o índice.
set -euo pipefail
: "${MONGODB:?defina MONGODB (ex.: MONGODB='mongodb://localhost:27017/simulado')}"
MODO="lista"
[[ "${1:-}" == "--aplicar" ]] && MODO="aplicar"
[[ "${1:-}" == "--excluir" ]] && MODO="excluir"

mongosh "$MONGODB" --quiet --eval "const MODO = '${MODO}';" --eval '
  const APLICAR = MODO !== "lista";
  const PESO = { completed: 4, processing: 3, awaiting_omr: 2, pending: 1, failed: 0 };
  const grupos = db.historicos.aggregate([
    { $match: { cartaoCode: { $type: "string" } } },
    { $group: {
        _id: { u: "$usuario", s: "$simulado", c: "$cartaoCode" },
        docs: { $push: { _id: "$_id", status: "$status", createdAt: "$createdAt" } },
        n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();

  print("grupos duplicados: " + grupos.length);
  let rebaixados = 0;
  for (const g of grupos) {
    const ordenados = g.docs.slice().sort((a, b) =>
      (PESO[b.status] ?? -1) - (PESO[a.status] ?? -1) ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const fica = ordenados[0];
    const saem = ordenados.slice(1);
    print("- usuario " + g._id.u + " | simulado " + g._id.s + " | cartão " + g._id.c +
          " → fica " + fica._id + " (" + fica.status + "); saem " +
          saem.map((d) => d._id + " (" + d.status + ")").join(", "));
    if (MODO === "aplicar") {
      for (const d of saem) {
        db.historicos.updateOne(
          { _id: d._id },
          { $rename: { cartaoCode: "cartaoCodeDuplicado" }, $set: { duplicadoDe: fica._id } },
        );
        rebaixados++;
      }
    }
    if (MODO === "excluir") {
      const ids = saem.map((d) => d._id);
      const v = db.relatoriosimuladoestudantes.deleteMany({ historico: { $in: ids } });
      const h = db.historicos.deleteMany({ _id: { $in: ids } });
      print("  apagados: " + h.deletedCount + " históricos, " + v.deletedCount + " vínculos no relatório");
      rebaixados += h.deletedCount;
    }
  }

  if (!APLICAR) {
    print("modo LISTA — nada foi escrito. Para resolver e criar o índice: --aplicar (sem apagar) ou --excluir");
    quit(0);
  }
  print((MODO === "excluir" ? "históricos apagados: " : "históricos rebaixados: ") + rebaixados);

  const sobra = db.historicos.aggregate([
    { $match: { cartaoCode: { $type: "string" } } },
    { $group: { _id: { u: "$usuario", s: "$simulado", c: "$cartaoCode" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray().length;
  if (sobra > 0) { print("ABORTADO: ainda há " + sobra + " grupos duplicados"); quit(1); }

  db.historicos.createIndex(
    { usuario: 1, simulado: 1, cartaoCode: 1 },
    { unique: true, name: "cartao_por_estudante",
      partialFilterExpression: { cartaoCode: { $type: "string" } } },
  );
  const tem = db.historicos.getIndexes().some((i) => i.name === "cartao_por_estudante");
  if (!tem) { print("ABORTADO: índice não criado"); quit(1); }
  print("índice cartao_por_estudante OK");
  print("migracao 0006 OK");
'
