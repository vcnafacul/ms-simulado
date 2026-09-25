/**
 * Recalcula o `aproveitamento` dos históricos já gravados — contagem-por-materia 02.
 *
 * ⚠️ **Por que existe:** o `aproveitamento` é GRAVADO no processamento, e até o
 * card 01 a matéria contava a questão uma vez POR FRENTE — questão com 3 frentes
 * de Matemática valia 3 questões ("0 de 4" numa prova com 2) e pesava 3 vezes
 * no percentual. O card 01 conserta daqui para frente; este conserta o passado.
 *
 * ⚠️ O card 13 recusou recálculo retroativo para uma MUDANÇA DE FÓRMULA. Aqui é
 * CORREÇÃO DE DEFEITO: o número antigo está errado, não só diferente.
 *
 * Uso:
 *   MONGODB="mongodb://.../db" yarn recalcular:aproveitamento             # dry-run
 *   MONGODB="mongodb://.../db" yarn recalcular:aproveitamento --escrever
 *
 * ⚠️ **Dry-run é o padrão**; escrever exige `--escrever`.
 * ⚠️ **Idempotente**: compara na forma canônica e só grava o que mudou — a
 *    segunda execução tem de dizer 0.
 * ⚠️ **Usa as questões e a classificação de HOJE.** Questão reclassificada
 *    depois do cartão entra com a frente nova — é o que o processamento faria
 *    se o cartão chegasse agora.
 * ⚠️ Só toca `aproveitamento`. O radar de turma (`user-group-aggregates`)
 *    deriva a matéria das FRENTES, e o card 01 não muda frente nenhuma.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { HistoricoStatus } from '../src/modules/historico/enums/historico-status.enum';
import {
  Historico,
  HistoricoSchema,
} from '../src/modules/historico/historico.schema';
import { Frente, FrenteSchema } from '../src/modules/frente/frente.schema';
import { Materia, MateriaSchema } from '../src/modules/materia/materia.schema';
import { Questao, QuestaoSchema } from '../src/modules/questao/questao.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../src/modules/simulado/schemas/simulado.schema';
import { recalcularAproveitamento } from '../src/modules/simulado/recalcularAproveitamento';

async function run(): Promise<void> {
  const escrever = process.argv.includes('--escrever');
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  /*
    ⚠️ Os schemas REAIS, e o MESMO populate do `SimuladoRepository.answer`. As
    frentes estão gravadas como string (ver `vinculosDaQuestao`), e é o cast do
    schema que faz o populate resolver — pelo driver cru, a montagem divergiria
    do processamento.
  */
  mongoose.model(Materia.name, MateriaSchema);
  mongoose.model(Frente.name, FrenteSchema);
  mongoose.model(Questao.name, QuestaoSchema);
  const SimuladoModel = mongoose.model(Simulado.name, SimuladoSchema);
  const HistoricoModel = mongoose.model(Historico.name, HistoricoSchema);

  const questoesDoSimulado = new Map<string, Questao[] | null>();
  /** Simulados cujo populate falhou, com o motivo — ver o README do card 02. */
  const falharam = new Map<string, string>();
  const carregarQuestoes = async (simuladoId: string) => {
    if (!questoesDoSimulado.has(simuladoId)) {
      /*
        ⚠️ **O populate pode ESTOURAR**, e não só voltar vazio: frente gravada
        como string vazia (`""`) dá `CastError` no `$in` do populate e derruba a
        consulta inteira — o mesmo que acontece no `processAnswer` real. O
        simulado fica de fora e é listado no fim.
      */
      const simulado = await SimuladoModel.findById(simuladoId)
        .populate({
          path: 'questoes.questao',
          populate: [
            { path: 'frente1', populate: { path: 'materia' } },
            { path: 'frente2', populate: { path: 'materia' } },
            { path: 'frente3', populate: { path: 'materia' } },
            { path: 'materia' },
          ],
          select: 'alternativa',
        })
        .exec()
        .catch((err: unknown) => {
          falharam.set(simuladoId, String(err).slice(0, 120));
          return null;
        });
      questoesDoSimulado.set(
        simuladoId,
        simulado
          ? simulado.questoes.map((qc: { questao: Questao }) => qc.questao)
          : null,
      );
    }
    return questoesDoSimulado.get(simuladoId)!;
  };

  const cursor = HistoricoModel.find(
    {
      status: HistoricoStatus.Completed,
      rawRespostas: { $type: 'array' },
      deleted: { $ne: true },
    },
    { simulado: 1, rawRespostas: 1, aproveitamento: 1 },
  )
    .lean()
    .cursor();

  let lidos = 0;
  let mudariam = 0;
  let semSimulado = 0;
  let exemplo: string | null = null;

  for await (const h of cursor) {
    lidos++;
    const questoes = await carregarQuestoes(String(h.simulado));
    // Simulado apagado, ou sem questões: o processamento marcaria falha —
    // aqui fica como está, e conta no relatório final.
    if (!questoes || questoes.length === 0 || questoes.some((q) => !q)) {
      semSimulado++;
      continue;
    }

    const { novo, mudou } = recalcularAproveitamento(
      h.aproveitamento,
      questoes,
      h.rawRespostas ?? [],
    );
    if (!mudou) continue;
    mudariam++;

    if (exemplo === null) {
      const resumo = (ap: any) =>
        (ap?.materias ?? [])
          .map(
            (m: any) =>
              `${m.nome} ${m.questoes ?? '?'}q ${Math.round((m.aproveitamento ?? 0) * 100)}%`,
          )
          .join(', ');
      exemplo = `${h._id}\n    antes:  ${resumo(h.aproveitamento)}\n    depois: ${resumo(novo)}`;
    }

    if (escrever) {
      await HistoricoModel.updateOne(
        { _id: h._id },
        { $set: { aproveitamento: novo } },
      );
    }
    if (lidos % 500 === 0) console.log(`… ${lidos} lidos, ${mudariam} a mudar`);
  }

  console.log(`\n${escrever ? '✍️  ESCRITA' : '🔎 DRY-RUN'}`);
  console.log(`históricos completed lidos:      ${lidos}`);
  console.log(
    `${escrever ? 'regravados' : 'mudariam'}:                       ${mudariam}`,
  );
  console.log(`pulados (simulado sumiu/falhou):  ${semSimulado}`);
  if (falharam.size > 0) {
    console.log(`\n⚠️  simulados cujo populate falhou: ${falharam.size}`);
    for (const [id, motivo] of falharam) console.log(`   ${id}  ${motivo}`);
  }
  if (exemplo) console.log(`\nexemplo: ${exemplo}`);
  if (!escrever && mudariam > 0) {
    console.log('\nPara gravar: rode de novo com --escrever');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect();
  process.exit(1);
});
