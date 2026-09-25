import { AproveitamentoHistorico } from '../historico/types/aproveitamento';
import { Questao } from '../questao/questao.schema';
import { RespostaAproveitamento } from './valueObject/resposta-aproveitamento';
import { vinculosDaQuestao } from './vinculosDaQuestao';

/**
 * A nota do estudante: geral, por matéria e por frente — pura, para o
 * `SimuladoService` e o script de recálculo usarem a mesma regra.
 *
 * ⚠️ **Cada nível conta a questão de um jeito** (contagem-por-materia 01):
 *
 * | nível   | conta a questão                         | soma fecha?              |
 * |---------|-----------------------------------------|--------------------------|
 * | geral   | uma vez                                 | no total da prova        |
 * | matéria | **uma vez por matéria que ela toca**    | não, se interdisciplinar |
 * | frente  | uma vez por frente que ela toca         | não fecha na matéria     |
 *
 * ⚠️ **A matéria NÃO é a soma das frentes.** Antes, cada vínculo (matéria,
 * frente) somava na matéria: uma questão com 3 frentes de Matemática contava
 * como 3 questões de Matemática ("0 de 4" numa prova com 2) — e pesava 3 vezes
 * no percentual. Agora a matéria conta as QUESTÕES que a tocam.
 *
 * ⚠️ **Frente com peso inteiro** (card 14, reafirmado no QA de 2026-09-25):
 * Financeira + Álgebra na mesma questão é legítimo, e a questão conta nas duas.
 * Se aparecerem mais erros de leitura, a alternativa discutida é contar só a
 * `frente1` no drill-down.
 */
export function calcularAproveitamento(
  respostas: RespostaAproveitamento[],
): AproveitamentoHistorico {
  /*
    Uma passada só: para cada resposta, cada MATÉRIA que ela toca ganha um
    acerto e um total (uma vez), e cada FRENTE também. O código antigo fazia três varreduras e um
    `find`/`filter` aninhado por matéria e por frente — O(n²) sobre 90
    questões, e impossível de ler.
  */
  const porMateria = new Map<
    string,
    {
      id: unknown;
      nome: string;
      acertos: number;
      total: number;
      frentes: Map<
        string,
        { id: unknown; nome: string; acertos: number; total: number }
      >;
    }
  >();

  let acertosGerais = 0;

  for (const res of respostas) {
    const acertou =
      res.alternativaEstudante !== undefined &&
      res.alternativaEstudante === res.alternativaCorreta;
    if (acertou) acertosGerais++;

    // As matérias que ESTA questão já contou — uma vez cada, por mais frentes
    // que ela tenha nelas.
    const materiasDaQuestao = new Set<string>();

    for (const v of vinculosDaQuestao(res.questao)) {
      const mid = String(v.materia._id);
      const m = porMateria.get(mid) ?? {
        id: v.materia._id,
        nome: v.materia.nome,
        acertos: 0,
        total: 0,
        frentes: new Map(),
      };
      if (!materiasDaQuestao.has(mid)) {
        materiasDaQuestao.add(mid);
        m.total++;
        if (acertou) m.acertos++;
      }

      const fid = String(v.frente._id);
      const f = m.frentes.get(fid) ?? {
        id: v.frente._id,
        nome: v.frente.nome,
        acertos: 0,
        total: 0,
      };
      f.total++;
      if (acertou) f.acertos++;
      m.frentes.set(fid, f);

      porMateria.set(mid, m);
    }
  }

  return {
    // ⚠️ Sobre as RESPOSTAS, não sobre os vínculos — ver o docblock acima.
    geral: respostas.length > 0 ? acertosGerais / respostas.length : 0,
    materias: [...porMateria.values()].map((m) => ({
      id: m.id as never,
      nome: m.nome,
      aproveitamento: m.total > 0 ? m.acertos / m.total : 0,
      /*
        ⚠️ **O total deixa de ser descartado** (card 30). Ele já era calculado
        aqui para dividir, e ia embora — então "Álgebra 60%" chegava à tela
        sem dizer de quantas questões.

        ⚠️ E isso importa desde o card 14: as bases NÃO somam o total do
        simulado, porque uma questão conta inteira em cada (matéria, frente)
        que toca. Sem a base, quem soma as matérias acha que a conta não fecha.
      */
      questoes: m.total,
      frentes: [...m.frentes.values()].map((f) => ({
        id: f.id as never,
        nome: f.nome,
        aproveitamento: f.total > 0 ? f.acertos / f.total : 0,
        questoes: f.total,
        materia: m.nome,
      })),
    })),
  };
}

/**
 * As entradas do cálculo: TODAS as questões do simulado, cada uma com o que o
 * estudante marcou (ou nada — não lida conta como erro, card 13).
 *
 * ⚠️ Saiu do `processAnswer` para o recálculo (contagem-por-materia 02) montar
 * as entradas do MESMO jeito. Duas montagens divergiriam, e o script gravaria
 * um número que o processamento nunca produziria.
 */
export function montarRespostasAproveitamento(
  questoes: Questao[],
  rawRespostas: { questao: unknown; alternativaEstudante?: unknown }[],
): RespostaAproveitamento[] {
  return questoes.map((questao) => {
    const resposta = rawRespostas.find(
      (r) => r.questao === questao._id.toString(),
    );
    return {
      questao,
      alternativaEstudante: resposta?.alternativaEstudante as never,
      alternativaCorreta: questao.alternativa,
      materia: questao.materia,
      frente: questao.frente1,
    };
  });
}
