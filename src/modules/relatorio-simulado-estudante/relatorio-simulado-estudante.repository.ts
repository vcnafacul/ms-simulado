import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Historico } from '../historico/historico.schema';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { Alternativa } from '../questao/enums/alternativa.enum';
import { RelatorioSimuladoEstudante } from './relatorio-simulado-estudante.schema';

/**
 * Só o que as telas dos cards 04–07 usam. `respostas` fica de fora de propósito:
 * 90 questões × centenas de estudantes é carga que nenhuma delas lê. O card 07
 * busca o histórico por id quando precisar do detalhe.
 */
const CAMPOS_DO_HISTORICO =
  'status cartaoCode questoesRespondidas aproveitamento.geral falha';

/**
 * `historico` é `| null` porque o `populate` de uma ref apagada (`Historico`
 * removido depois do vínculo) devolve `null`, não lança — quem consome isto
 * (a service) precisa tratar a ausência, não presumir a ref viva.
 */
export type LinhaComHistorico = RelatorioSimuladoEstudante & {
  historico: Historico | null;
};

export interface AgregadoDaQuestao {
  questaoId: string;
  respondentes: number;
  acertos: number;
  erros: number;
  semLeitura: number;
  porAlternativa: Record<string, number>;
}

export interface SimuladoComCartao {
  simuladoId: string;
  cartoes: number;
  comLeituraConcluida: number;
  ultimoEnvio: Date | null;
}

@Injectable()
export class RelatorioSimuladoEstudanteRepository {
  constructor(
    @InjectModel(RelatorioSimuladoEstudante.name)
    private readonly model: Model<RelatorioSimuladoEstudante>,
  ) {}

  /**
   * Uma linha por estudante por simulado por cursinho, apontando para a tentativa
   * ATUAL. Reenviar depois de uma falha cria um `Historico` novo — sem o upsert,
   * nasceria uma segunda linha e o estudante apareceria duas vezes no relatório.
   *
   * Só a escrita: as consultas do relatório são de um card posterior.
   */
  async registrar(data: {
    historicoId: string;
    simuladoId: string;
    usuario: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<void> {
    await this.model.updateOne(
      {
        simulado: new Types.ObjectId(data.simuladoId),
        cursinhoId: data.cursinhoId,
        usuario: data.usuario,
      },
      {
        $set: {
          historico: new Types.ObjectId(data.historicoId),
          turmaId: data.turmaId,
        },
      },
      { upsert: true },
    );
  }

  /**
   * As linhas de um simulado dentro de um recorte. O recorte é imposto AQUI, no
   * Mongo — trazer tudo e filtrar do outro lado transporta dados de outros
   * cursinhos pela rede interna e não escala.
   */
  async buscarPorRecorte(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<LinhaComHistorico[]> {
    const filtro: Record<string, unknown> = {
      simulado: new Types.ObjectId(params.simuladoId),
      cursinhoId: params.cursinhoId,
    };
    // `{ turmaId: undefined }` vira `{ turmaId: null }` e casa SÓ quem não tem
    // turma — a visão do cursinho inteiro perderia todo mundo COM turma.
    if (params.turmaId !== undefined) {
      filtro.turmaId = params.turmaId;
    }

    return this.model
      .find(filtro)
      .sort({ usuario: 1 })
      .populate({ path: 'historico', select: CAMPOS_DO_HISTORICO })
      .lean()
      .exec() as unknown as Promise<LinhaComHistorico[]>;
  }

  /**
   * Quantos cartões deste simulado o cursinho enviou. Alimenta o rodapé do
   * relatório por turma — "27 dos 30 cartões deste simulado são desta turma".
   *
   * ⚠️ Escopado no cursinho, nunca global: um `countDocuments({ simulado })`
   * diria a um cursinho quantos cartões os outros enviaram.
   */
  async contarDoCursinho(
    simuladoId: string,
    cursinhoId: string,
  ): Promise<number> {
    return this.model.countDocuments({
      simulado: new Types.ObjectId(simuladoId),
      cursinhoId,
    });
  }

  /**
   * Acertos, erros e distribuição por alternativa, por questão, dentro do recorte.
   *
   * A resposta em branco chega com a chave `alternativaEstudante` AUSENTE — não
   * `null`, não `""` (o `processAnswer` emite uma linha por questão do simulado e
   * deixa o campo indefinido quando o aluno não marcou). Daí o `$ifNull`.
   *
   * ⚠️ `acertos`, `erros` e `semLeitura` são contados INDEPENDENTES, não derivados
   * um do outro. Derivar `erros = respondentes - acertos - semLeitura` tornaria a
   * invariante verdadeira por construção e o teste que a afirma, vazio.
   *
   * ⚠️ `respondentes` conta LINHAS de resposta, e a premissa é que há uma linha
   * por estudante por questão. Ela vale enquanto um `Simulado` não tiver a mesma
   * questão duas vezes — hoje possível por uma corrida no `adicionarEmProva`
   * (ver docs/cards/etapa-11/BUG-corrida-no-adicionar-questao-em-prova.md).
   * A decisão foi fechar a corrida na origem, não contar históricos distintos
   * aqui: blindar a consulta carregaria a complexidade para sempre, por uma
   * corrida que vai deixar de existir. O teste que documenta isso está no
   * `*.isolamento.spec.ts`.
   */
  async agregarPorQuestao(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<AgregadoDaQuestao[]> {
    const match: Record<string, unknown> = {
      simulado: new Types.ObjectId(params.simuladoId),
      cursinhoId: params.cursinhoId,
    };
    // mesma armadilha do card 02: `{turmaId: undefined}` vira `{turmaId: null}`
    if (params.turmaId !== undefined) {
      match.turmaId = params.turmaId;
    }

    const marcada = { $ifNull: ['$h.respostas.alternativaEstudante', null] };
    const porAlternativa = Object.fromEntries(
      Object.values(Alternativa).map((alt) => [
        alt,
        { $sum: { $cond: [{ $eq: [marcada, alt] }, 1, 0] } },
      ]),
    );

    const linhas = await this.model
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'historicos',
            localField: 'historico',
            foreignField: '_id',
            as: 'h',
          },
        },
        // Só `completed` tem `respostas` VÁLIDAS. Não basta o $unwind descartar
        // array vazio: `marcarFalha` e `prepararParaProcessamento` NÃO limpam
        // `respostas`, então um cartão que completou, reprocessou e falhou
        // continuaria votando com as respostas velhas — para sempre.
        { $unwind: '$h' },
        { $match: { 'h.status': HistoricoStatus.Completed } },
        { $unwind: '$h.respostas' },
        {
          $group: {
            _id: '$h.respostas.questao',
            respondentes: { $sum: 1 },
            acertos: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [marcada, null] },
                      {
                        $eq: [
                          '$h.respostas.alternativaEstudante',
                          '$h.respostas.alternativaCorreta',
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            erros: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [marcada, null] },
                      {
                        $ne: [
                          '$h.respostas.alternativaEstudante',
                          '$h.respostas.alternativaCorreta',
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            semLeitura: {
              $sum: { $cond: [{ $eq: [marcada, null] }, 1, 0] },
            },
            ...porAlternativa,
          },
        },
      ])
      .exec();

    return linhas.map((l: any) => ({
      questaoId: l._id?.toString(),
      respondentes: l.respondentes,
      acertos: l.acertos,
      erros: l.erros,
      semLeitura: l.semLeitura,
      porAlternativa: Object.fromEntries(
        Object.values(Alternativa).map((alt) => [alt, l[alt] ?? 0]),
      ),
    }));
  }

  /**
   * Quais simulados têm cartão neste recorte, e quantos.
   *
   * ⚠️ **Parece irmã da `agregarPorQuestao` e não é.** Lá o `$unwind` é
   * estrito e seguido de `$match: { 'h.status': completed }`, porque o
   * objetivo é DESCARTAR quem não completou. Aqui o objetivo é o oposto:
   * contar todo mundo que enviou e classificar por status. Por isso
   * `preserveNullAndEmptyArrays: true` — sem ele, a linha cuja ref de
   * `Historico` morreu (o mesmo caso que faz `LinhaComHistorico.historico`
   * ser `| null`) some da contagem, e `cartoes` fica menor que o número de
   * cartões que realmente chegaram, sem nada acusar.
   *
   * ⚠️ `ultimoEnvio` é o `$max` do `createdAt` das LINHAS, e `registrar` é
   * upsert: um reenvio do mesmo estudante não rebumba a data. Logo isto é
   * "quando o estudante mais recente entrou no recorte", não "última
   * atividade" — o consumidor não deve exibi-lo como tal.
   */
  async listarSimuladosComCartao(params: {
    cursinhoId: string;
    turmaId?: string;
  }): Promise<SimuladoComCartao[]> {
    // `{turmaId: undefined}` serializa para `{turmaId: null}` e casaria só
    // quem NÃO tem turma — a chave precisa estar ausente. Lição do card 02.
    const match: Record<string, unknown> = { cursinhoId: params.cursinhoId };
    if (params.turmaId !== undefined) {
      match.turmaId = params.turmaId;
    }

    const linhas = await this.model
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'historicos',
            localField: 'historico',
            foreignField: '_id',
            as: 'h',
          },
        },
        { $unwind: { path: '$h', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$simulado',
            cartoes: { $sum: 1 },
            comLeituraConcluida: {
              $sum: {
                $cond: [
                  { $eq: ['$h.status', HistoricoStatus.Completed] },
                  1,
                  0,
                ],
              },
            },
            ultimoEnvio: { $max: '$createdAt' },
          },
        },
        { $sort: { ultimoEnvio: -1 } },
      ])
      .exec();

    return linhas.map((l) => ({
      simuladoId: l._id.toString(),
      cartoes: l.cartoes,
      comLeituraConcluida: l.comLeituraConcluida,
      ultimoEnvio: l.ultimoEnvio ?? null,
    }));
  }
}
