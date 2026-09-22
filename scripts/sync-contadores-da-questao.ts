/**
 * Sync dos contadores globais da questão — card 22.
 *
 * Reconstrói `quantidadeResposta`, `acertos` e `quantidadeSimulado` a partir das
 * fontes de verdade (`historicos.respostas[]` e `simulados.questoes[]`), em vez
 * de confiar no que foi contado incrementalmente no passado.
 *
 * ⚠️ **Por que existe:** a auditoria do card 16 mediu, em homologação, que
 * **0 de 181** questões com contador tinham `quantidadeResposta` batendo com o
 * histórico. O card 21 consertou a escrita daqui para frente; este reconstrói o
 * passado.
 *
 * ⚠️ **Por reconstruir do zero — e não aplicar deltas — ele é imune a tudo que
 * quebrou antes:** dupla contagem por reprocessamento, incremento de questão em
 * branco e o descompasso dos históricos antigos. Roda uma vez e os números
 * passam a bater.
 *
 * Uso:
 *   MONGODB="mongodb://.../db" npx ts-node scripts/sync-contadores-da-questao.ts
 *   MONGODB="..." npx ts-node scripts/sync-contadores-da-questao.ts --escrever
 *
 * ⚠️ **`--dry-run` é o padrão, e escrever exige `--escrever`.** Não é cerimônia:
 * quem roda isto pela primeira vez precisa ver o tamanho do estrago antes de
 * aplicá-lo, e o número de divergentes é a linha de base que o card 16 usa para
 * decidir se a base serve para exibir.
 *
 * ⚠️ **Idempotente**: usa `$set`, não `$inc`. Rodar duas vezes dá o mesmo
 * resultado — foi o `$inc` que produziu o estado que este script conserta.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  ContadoresDaQuestao,
  operacoesDeEscrita,
  PIPELINE_RESPOSTAS,
  PIPELINE_SIMULADOS,
  planoDeSync,
} from '../src/modules/questao/sync-contadores';

/** Quantas operações por `bulkWrite`. */
const LOTE = 1000;

async function run(): Promise<void> {
  const escrever = process.argv.includes('--escrever');
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Falha ao obter a conexão do banco.');
    process.exit(1);
  }

  const t0 = Date.now();

  /*
    ⚠️ Projeção mínima. A `Questao` carrega enunciado, alternativas e assets —
    são 2.640 documentos em homologação, e trazer o corpo inteiro para ler três
    inteiros é o tipo de coisa que faz um script de manutenção derrubar o
    banco em produção.
  */
  const atuais = new Map<string, Partial<ContadoresDaQuestao>>();
  const cursor = db.collection('questaos').find(
    {},
    {
      projection: { quantidadeResposta: 1, acertos: 1, quantidadeSimulado: 1 },
    },
  );
  for await (const q of cursor) {
    atuais.set(String(q._id), q as Partial<ContadoresDaQuestao>);
  }

  const respostas = await db
    .collection('historicos')
    .aggregate(PIPELINE_RESPOSTAS, { allowDiskUse: true })
    .toArray();
  const respondidas = new Map(
    respostas.map((r) => [
      String(r._id),
      { quantidadeResposta: r.quantidadeResposta, acertos: r.acertos },
    ]),
  );

  const simulados = await db
    .collection('simulados')
    .aggregate(PIPELINE_SIMULADOS, { allowDiskUse: true })
    .toArray();
  const emSimulados = new Map(
    simulados.map((s) => [String(s._id), s.quantidadeSimulado as number]),
  );

  const plano = planoDeSync(atuais, respondidas, emSimulados);
  const ms = Date.now() - t0;

  console.log(`questões na coleção:        ${plano.resumo.questoes}`);
  console.log(`questões com resposta:      ${respondidas.size}`);
  console.log(`questões em algum simulado: ${emSimulados.size}`);
  console.log(`⚠️  divergentes:             ${plano.resumo.divergentes}`);
  console.log(`leitura e cálculo em ${ms} ms`);

  if (plano.resumo.maiores.length > 0) {
    console.log('\nmaiores divergências (respostas · acertos · simulados):');
    for (const op of plano.resumo.maiores) {
      console.log(
        `  ${op.id}  ` +
          `${op.de.quantidadeResposta}→${op.para.quantidadeResposta} · ` +
          `${op.de.acertos}→${op.para.acertos} · ` +
          `${op.de.quantidadeSimulado}→${op.para.quantidadeSimulado}`,
      );
    }
  }

  if (!escrever) {
    console.log(
      '\nNada foi escrito. Rode de novo com --escrever para aplicar.',
    );
    await mongoose.disconnect();
    return;
  }

  /*
    ⚠️ **O `_id` volta a ser `ObjectId`.** O driver nativo não casta: um filtro
    com string não casaria com nada, o `bulkWrite` terminaria sem erro e o
    script diria "concluído" sem ter escrito uma linha.
  */
  const operacoes = operacoesDeEscrita(
    plano,
    (id) => new mongoose.Types.ObjectId(id),
  );
  for (let i = 0; i < operacoes.length; i += LOTE) {
    const lote = operacoes.slice(i, i + LOTE);
    await db.collection('questaos').bulkWrite(lote);
    console.log(
      `✓ ${Math.min(i + LOTE, operacoes.length)}/${operacoes.length}`,
    );
  }

  console.log(`\nSync concluído: ${operacoes.length} questões atualizadas.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
