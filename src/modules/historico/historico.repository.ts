import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { AggregatePeriodDtoInput } from 'src/shared/dtos/aggregate-period.dto.input';
import { AggregateHistoricoDtoOutput } from './dtos/aggregate-historico.dto.output';
import { AggregatePeriodByTypeDtoOutput } from './dtos/aggregate-period-by-type.dto.output';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { HistoricoStatus } from './enums/historico-status.enum';
import { buildFullSeriesHistorico } from './handle/build-full-series-historico';
import { buildFullSeriesHistoricoByType } from './handle/build-full-seriesH-historico-by-type';
import { Historico } from './historico.schema';

@Injectable()
export class HistoricoRepository extends BaseRepository<Historico> {
  constructor(@InjectModel(Historico.name) model: Model<Historico>) {
    super(model);
  }

  async getAllByUser({
    page,
    limit,
    userId,
  }: GetHistoricoDTOInput): Promise<GetAllOutput<Historico>> {
    const data = await this.model
      .find({ usuario: userId })
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
        select: '_id nome',
      })
      .exec();

    const totalItems = await this.model
      .find({ usuario: userId })
      .countDocuments();
    return {
      data,
      page,
      limit,
      totalItems,
    };
  }

  /**
   * O histórico de UM dono. É o gate de `GET /mssimulado/historico/:id`.
   *
   * ⚠️ **Método novo, e não uma assinatura mais larga no `getById`.** Aquele é
   * um `override` do `BaseRepository` e tem dois chamadores internos
   * (`simulado.service.ts` e `answer-processor.service.ts`) que leem por id sem
   * contexto de usuário, legitimamente. Alargá-lo quebraria os dois e brigaria
   * com a classe base.
   *
   * ⚠️ **O filtro é o gate.** `usuario` dentro do `findOne` já não encontra
   * histórico alheio — não existe checagem separada que alguém possa esquecer
   * de escrever. Mas isso vale para o FILTRO: o valor precisa vir do JWT, na
   * api, e não de algo que o chamador escolhe.
   */
  async getByIdAndUsuario(id: string, usuario: string): Promise<Historico> {
    return this.model
      .findOne({ _id: id, usuario })
      .populate({
        path: 'simulado',
        populate: [{ path: 'questoes.questao' }],
      })
      .exec();
  }

  override async getById(id: string): Promise<Historico> {
    return this.model
      .findById(id)
      .populate({
        path: 'simulado',
        populate: [{ path: 'questoes.questao' }],
      })
      .exec();
  }

  async getToPerformance(userId: string): Promise<Historico[]> {
    return this.model
      .find({ usuario: userId })
      .sort({ _id: -1 })
      .populate({
        path: 'simulado',
      })
      .exec();
  }

  async getTotalEntity() {
    return this.model.find({ deletedAt: null }).count();
  }

  /**
   * Quantas tentativas chegaram ao fim, na plataforma inteira.
   *
   * ⚠️ **O critério é `status: completed`**, e não
   * `size(respostas) == questoesRespondidas` como antes. Aquele campo só tem
   * escritores do fluxo digital, então todo cartão-resposta era contado como
   * incompleto — e o erro crescia junto com a adoção da feature. Mesma decisão
   * do agregado da turma; ver o docblock em `user-group-aggregate.repository`.
   */
  async entityCompleted() {
    const result: { total: number }[] = await this.model.aggregate([
      {
        $match: {
          deletedAt: null,
          status: HistoricoStatus.Completed,
        },
      },
      {
        $count: 'total',
      },
    ]);
    // ⚠️ `$count` NÃO emite linha para conjunto vazio: sem o `?? 0` isto era um
    // TypeError, e o endpoint de resumo respondia 500 numa base sem nenhuma
    // tentativa completa.
    return result[0]?.total ?? 0;
  }

  async aggregateByPeriod({ groupBy }: AggregatePeriodDtoInput) {
    const format =
      groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'month' ? '%Y-%m' : '%Y';

    const result = await this.model.aggregate([
      { $addFields: { created_at: { $toDate: '$_id' } } },
      {
        $group: {
          _id: { period: { $dateToString: { format, date: '$created_at' } } },
          total: { $sum: 1 },
          // ⚠️ Os dois ramos usam `status`, pelo mesmo motivo do
          // `entityCompleted` acima: pelo critério antigo o cartão-resposta
          // caía inteiro em "incompletos". Eles têm de continuar sendo a
          // negação um do outro — juntos fecham o `total`.
          completos: {
            $sum: {
              $cond: [{ $eq: ['$status', HistoricoStatus.Completed] }, 1, 0],
            },
          },
          incompletos: {
            $sum: {
              $cond: [{ $ne: ['$status', HistoricoStatus.Completed] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          total: 1,
          completos: 1,
          incompletos: 1,
        },
      },
      { $sort: { period: 1 } },
    ]);

    return buildFullSeriesHistorico(
      groupBy,
      result as AggregateHistoricoDtoOutput[],
    );
  }

  async aggregateByPeriodAndTipo({
    groupBy,
  }: AggregatePeriodDtoInput): Promise<AggregatePeriodByTypeDtoOutput[]> {
    const format =
      groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'month' ? '%Y-%m' : '%Y';

    const result = await this.model.aggregate([
      // gera created_at com base no ObjectId
      { $addFields: { created_at: { $toDate: '$_id' } } },

      // junta com Simulado
      {
        $lookup: {
          from: 'simulados', // nome real da collection
          localField: 'simulado',
          foreignField: '_id',
          as: 'simulado',
        },
      },
      { $unwind: { path: '$simulado', preserveNullAndEmptyArrays: true } },

      // junta com Categoria
      {
        $lookup: {
          from: 'categorias', // nome real da collection
          localField: 'simulado.categoria',
          foreignField: '_id',
          as: 'tipo',
        },
      },
      { $unwind: { path: '$tipo', preserveNullAndEmptyArrays: true } },

      // agrupa por período e tipo
      {
        $group: {
          _id: {
            period: { $dateToString: { format, date: '$created_at' } },
            tipo: '$tipo.nome',
          },
          total: { $sum: 1 },
        },
      },

      // remodela para DTO
      {
        $project: {
          _id: 0,
          period: '$_id.period',
          tipo: '$_id.tipo', // pode ser null
          total: 1,
        },
      },
      { $sort: { period: 1, tipo: 1 } },
    ]);

    return buildFullSeriesHistoricoByType(
      groupBy,
      result,
    ) as AggregatePeriodByTypeDtoOutput[];
  }

  async createPending(data: {
    usuario: string;
    simuladoId: string;
    rawRespostas: any[];
    tempoRealizado: number;
    questoesRespondidas: number;
  }): Promise<Historico> {
    return this.model.create({
      usuario: data.usuario,
      simulado: new Types.ObjectId(data.simuladoId),
      rawRespostas: data.rawRespostas,
      tempoRealizado: data.tempoRealizado,
      questoesRespondidas: data.questoesRespondidas,
      status: HistoricoStatus.Pending,
    });
  }

  async existsCartaoAtivo(
    usuario: string,
    simuladoId: string,
    cartaoCode: string,
  ): Promise<boolean> {
    const found = await this.model.exists({
      usuario,
      simulado: new Types.ObjectId(simuladoId),
      cartaoCode,
      status: { $ne: HistoricoStatus.Failed },
    });
    return found !== null;
  }

  async createAwaitingOmr(data: {
    usuario: string;
    simuladoId: string;
    imageKey: string;
    cartaoCode: string;
    tentativaId: string;
  }): Promise<Historico> {
    return this.model.create({
      usuario: data.usuario,
      simulado: new Types.ObjectId(data.simuladoId),
      imageKey: data.imageKey,
      cartaoCode: data.cartaoCode,
      tentativaId: data.tentativaId,
      status: HistoricoStatus.AwaitingOmr,
    });
  }

  async findByStatuses(statuses: HistoricoStatus[]): Promise<Historico[]> {
    return this.model.find({ status: { $in: statuses } }).exec();
  }

  /**
   * Históricos parados em `awaiting_omr` desde antes de `corte`.
   *
   * ⚠️ **O `$or` não é enfeite — cada ramo cobre um caso que o outro não
   * alcança**, e isto vem de dois fatos medidos:
   *
   * 1. Este schema é `@Schema({ timestamps: false })`: **não há `createdAt`**.
   * 2. `createAwaitingOmr` não grava `ultimaTentativaEm`; só o
   *    `reabrirParaOmr` (card 09) grava.
   *
   * O primeiro ramo respeita o reprocesso: um cartão criado há três dias mas
   * reenviado há um minuto está esperando há um minuto, e não pode ser varrido.
   *
   * O segundo alcança quem nunca foi reprocessado — a maioria, e justamente os
   * que já estão presos hoje — pelo timestamp que o ObjectId do Mongo embute.
   * **Sem migração**, que é o ponto: são esses documentos que motivaram o card.
   */
  async findAwaitingOmrAntigos(corte: Date): Promise<Historico[]> {
    return this.model
      .find({
        status: HistoricoStatus.AwaitingOmr,
        $or: [
          { ultimaTentativaEm: { $lt: corte } },
          {
            ultimaTentativaEm: { $exists: false },
            _id: {
              $lt: Types.ObjectId.createFromTime(
                Math.floor(corte.getTime() / 1000),
              ),
            },
          },
        ],
      })
      .exec();
  }

  /**
   * Marca o histórico como falho E registra o motivo numa ÚNICA escrita.
   *
   * A atomicidade não é detalhe: o card 09 precisa da operação inversa (voltar o
   * status e `$unset` a falha), e em duas escritas existe uma janela em que a tela
   * mostra "processando" com a mensagem de erro anterior ao lado.
   */
  async marcarFalha(
    id: string,
    codigo: string,
    detalhe?: string,
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: HistoricoStatus.Failed,
        falha: { codigo, detalhe },
      })
      .exec();
  }

  /**
   * A operação inversa do `marcarFalha`: devolve o histórico para a fila do OMR.
   *
   * ⚠️ **Uma escrita, e isso é o ponto.** O `$set` e o `$unset` vão juntos: em
   * duas operações existe uma janela em que a tela mostra "processando" com a
   * mensagem de erro anterior ao lado. É o que o docblock do `marcarFalha` já
   * antecipava para este card.
   *
   * ⚠️ `imageKey` só entra no `$set` quando há foto nova. Omitido, a chave
   * atual fica — é o caminho do `reprocessar`, em que a infra falhou e a foto
   * serve.
   */
  async reabrirParaOmr(
    id: string,
    dados: { imageKey?: string; quando: Date; tentativaId: string },
  ): Promise<void> {
    const set: Record<string, unknown> = {
      status: HistoricoStatus.AwaitingOmr,
      ultimaTentativaEm: dados.quando,
      tentativaId: dados.tentativaId,
    };
    if (dados.imageKey !== undefined) {
      set.imageKey = dados.imageKey;
    }

    await this.model
      .findByIdAndUpdate(id, { $set: set, $unset: { falha: '' } })
      .exec();
  }

  async findByImageKey(imageKey: string): Promise<Historico | null> {
    return this.model.findOne({ imageKey }).exec();
  }

  async prepararParaProcessamento(
    id: string,
    rawRespostas: unknown[],
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { rawRespostas, status: HistoricoStatus.Pending })
      .exec();
  }

  async claimForProcessing(id: string): Promise<boolean> {
    const result = await this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: {
            $in: [HistoricoStatus.Pending, HistoricoStatus.Processing],
          },
        },
        { status: HistoricoStatus.Processing },
      )
      .exec();
    return result !== null;
  }

  async completeProcessing(
    id: string,
    data: {
      ano: number;
      simulado: any;
      respostas: any[];
      aproveitamento: any;
      /** Quantas questões saíram com marcação legível — ver `processAnswer`. */
      questoesRespondidas: number;
    },
  ): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, {
        status: HistoricoStatus.Completed,
        ano: data.ano,
        simulado: data.simulado,
        respostas: data.respostas,
        aproveitamento: data.aproveitamento,
        questoesRespondidas: data.questoesRespondidas,
        rawRespostas: null,
      })
      .exec();
  }
}
