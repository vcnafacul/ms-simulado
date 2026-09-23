import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Prova } from '../prova/prova.schema';
import { resolveQuestaoId } from '../prova/helpers/question-container.helpers';
import { Resposta } from '../historico/types/resposta';
import { UpdateClassificacaoDTOInput } from './dtos/update-classificacao.dto.input';
import { UpdateContentDTOInput } from './dtos/update-content.dto.input';
import { UpdateImageAlternativaDTOInput } from './dtos/update-image-alternativa.dto.input';
import { UpdateImageIdDTOInput } from './dtos/update-image-id.dto.input';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';

/** Entrada do reverse-lookup: prova que contém a questão + o número nela. */
export interface ProvaContendo {
  provaId: string;
  provaNome: string;
  numero: number;
}

@Injectable()
export class QuestaoRepository extends BaseRepository<Questao> {
  constructor(
    @InjectModel(Questao.name) model: Model<Questao>,
    @InjectModel(Prova.name) private readonly provaModel: Model<Prova>,
  ) {
    super(model);
  }

  override async getAll({
    page,
    limit,
    where,
    or,
    sortColumn = 'updatedAt',
    sortOrder = 'asc',
  }: GetAllWhereInput): Promise<GetAllOutput<Questao>> {
    const sortDirection: 1 | -1 = sortOrder === 'desc' ? -1 : 1;
    const sort: Record<string, 1 | -1> = {
      [sortColumn ?? 'updatedAt']: sortDirection,
    };

    const query = this.model
      .find()
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .populate(['materia'])
      .select('+alternativa');

    const queryCount = this.model.where({ ...where });

    if (or.length > 0) {
      query.and(
        or.map((o) => ({
          $or: o,
        })),
      );
      queryCount.and(
        or.map((o) => ({
          $or: o,
        })),
      );
    }
    query.where({ ...where });
    const data = await query;
    const totalItems = await queryCount.countDocuments();

    return {
      data,
      page: page,
      limit: limit,
      totalItems,
    };
  }

  override async getById(id: string) {
    return await this.model.findById(id).select('+alternativa');
  }

  async findProvaAtual(questaoId: string): Promise<string | undefined> {
    const prova = await this.provaModel
      .findOne({ 'questoes.questao': questaoId })
      .select('_id')
      .exec();
    return prova?._id?.toString();
  }

  async findAnoByQuestao(questaoId: string): Promise<number | undefined> {
    const prova = await this.provaModel
      .findOne({ 'questoes.questao': questaoId })
      .select('ano')
      .exec();
    return prova?.ano;
  }

  async provaContemQuestao(
    provaId: string,
    questaoId: string,
  ): Promise<boolean> {
    const found = await this.provaModel.exists({
      _id: provaId,
      'questoes.questao': questaoId,
    });
    return !!found;
  }

  async getByIdToUpdate(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'materia']);
  }

  async getByIdToDelete(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'materia']);
  }

  /**
   * ⚠️ **A ordenação por `quantidadeSimulado` é INERTE hoje, e sempre foi.**
   *
   * O único escritor do campo era o `IncrementaSimulado`, que **nenhum caminho
   * chamava** — removido no card 21 justamente para não parecer em uso. Medido
   * em homologação: `quantidadeSimulado` é `0` nas 2.640 questões, então o
   * `sort` empata tudo e o Mongo devolve na ordem que quiser.
   *
   * ⚠️ **Quem escrever o sync do card 22 precisa saber disto:** ao materializar
   * o campo, esta ordenação passa a funcionar pela primeira vez, e a geração
   * automática de simulado **muda de comportamento** — ela começa de fato a
   * preferir as questões menos usadas, que é o que sempre quis fazer. É melhoria,
   * mas não é no-op, e ninguém deve descobrir isso em produção.
   */
  async getQuestaoByFiltro(filtro: object, quant: number): Promise<Questao[]> {
    const questoes = await this.model
      .find(filtro)
      .exists('imageId', true)
      .select('_id')
      .sort({ quantidadeSimulado: 1 })
      .limit(quant)
      .exec();

    return questoes;
  }

  async UpdateStatus(_id: string, status: Status) {
    await this.model.updateOne({ _id }, { status });
  }

  async updateQuestion(question: UpdateDTOInput) {
    if (question.frente2 === '') question.frente2 = null;
    if (question.frente3 === '') question.frente3 = null;
    await this.model.updateOne({ _id: question._id }, { ...question });
  }

  async updateClassificacao(
    id: string,
    classificacao: UpdateClassificacaoDTOInput,
  ) {
    const updateData: any = {
      enemArea: classificacao.enemArea,
      materia: classificacao.materia,
      frente1: classificacao.frente1,
      provaClassification: classificacao.provaClassification,
      subjectClassification: classificacao.subjectClassification,
      reported: classificacao.reported,
    };

    if (classificacao.frente2 !== undefined) {
      updateData.frente2 = classificacao.frente2 || null;
    }
    if (classificacao.frente3 !== undefined) {
      updateData.frente3 = classificacao.frente3 || null;
    }

    await this.model.updateOne({ _id: id }, updateData);
  }

  async updateContent(id: string, content: UpdateContentDTOInput) {
    const updateData: any = {
      textoQuestao: content.textoQuestao,
      textoAlternativaA: content.textoAlternativaA,
      textoAlternativaB: content.textoAlternativaB,
      textoAlternativaC: content.textoAlternativaC,
      textoAlternativaD: content.textoAlternativaD,
      textoAlternativaE: content.textoAlternativaE,
      alternativa: content.alternativa,
      textClassification: content.textClassification,
      alternativeClassfication: content.alternativeClassfication,
    };

    if (content.pergunta !== undefined) {
      updateData.pergunta = content.pergunta;
    }

    if (content.contentFormat !== undefined) {
      updateData.contentFormat = content.contentFormat;
    }

    await this.model.updateOne({ _id: id }, updateData);
  }

  async updateImageId(id: string, imageId: UpdateImageIdDTOInput) {
    await this.model.updateOne(
      { _id: id },
      { imageId: imageId.imageId || null },
    );
  }

  async setProvaBase(
    id: string,
    provaBase: string | null,
    session?: ClientSession,
  ) {
    await this.model.updateOne({ _id: id }, { provaBase }, { session });
  }

  async updateImageAlternativa(
    id: string,
    imageAlternativa: UpdateImageAlternativaDTOInput,
  ) {
    const campoImageAlternativa = `imageAlternativa${imageAlternativa.alternativa}`;
    const updateData: any = {};
    updateData[campoImageAlternativa] =
      imageAlternativa.imageAlternativa || null;

    await this.model.updateOne({ _id: id }, updateData);
  }

  /**
   * Os contadores globais da questão: quantas vezes foi respondida e quantas
   * vezes acertaram — somando todos os cursinhos, todas as aplicações e os dois
   * fluxos (digital e cartão).
   *
   * ⚠️ **Três defeitos foram consertados aqui no card 21, e vale saber quais**,
   * porque os números em produção ainda carregam o efeito deles até o sync do
   * card 22 rodar.
   *
   * ---
   *
   * ⚠️ **1. Só conta quem RESPONDEU.** O chamador monta a lista mapeando sobre
   * TODAS as questões do simulado, com `alternativaEstudante` indefinido para
   * quem não marcou — antes, toda questão da prova levava `+1` em
   * `quantidadeResposta`, inclusive em branco e não lida.
   *
   * O campo virava contagem de APRESENTAÇÕES com nome de contagem de respostas.
   * Medido em homologação: dos 17 históricos completos, 205 linhas de resposta e
   * apenas 100 com marcação — qualquer `acertos / quantidadeResposta` sairia com
   * o denominador inflado em ~2×.
   *
   * ⚠️ **2. Gabarito ausente não é acerto** — e esta guarda é **redundante
   * hoje**, dito assim porque a mutação que a remove SOBREVIVE a todos os
   * testes, e vale saber por quê antes de alguém "simplificar".
   *
   * O caso perigoso é `undefined === undefined`, que o card 08 encontrou do
   * outro lado e que aqui teria caminho: `Questao.alternativa` é
   * `@Prop({ select: false })`. Só que ele exige `alternativaEstudante`
   * indefinido, e o item 1 acima já descartou essas respostas antes de chegar
   * aqui. Com o estudante tendo marcado, `undefined === 'A'` é `false` sem
   * ajuda nenhuma.
   *
   * Fica porque é a intenção escrita — "só conto acerto se sei o gabarito" — e
   * porque ela deixa de ser redundante no instante em que alguém mexer na
   * guarda do item 1. É defesa em profundidade declarada, não cobertura que os
   * testes garantem. Mesma postura (e mesmo motivo) do `!= null` em
   * `flagsDaQuestao` no client.
   *
   * ⚠️ **3. Reprocessar DESCONTA o que já tinha sido contado.** `$inc` puro não
   * é idempotente, e `prepararParaProcessamento` devolve o histórico a `Pending`
   * — é o caminho do reenvio de foto e do callback do OMR. Sem isto, o mesmo
   * cartão contava duas vezes.
   *
   * ⚠️ **E descontar é diferente de pular.** No reenvio as respostas MUDARAM: a
   * foto nova pode ter lido uma questão que a anterior não leu. Ignorar a
   * segunda passada congelaria a leitura ruim; o certo é remover a contagem
   * antiga e aplicar a nova.
   *
   * ⚠️ Tudo num `bulkWrite` só: a mesma questão pode aparecer dos dois lados, e
   * duas chamadas deixariam uma janela em que o contador está negativo.
   */
  /**
   * Os contadores globais de um conjunto de questões — o acerto da BASE
   * INTEIRA, não do recorte do relatório (card 16).
   *
   * Responde a pergunta que o recorte não pode responder: *"minha turma foi mal
   * nesta questão, ou a questão é difícil para todo mundo?"*. Saber que a base
   * acerta 24% muda a conclusão de "preciso dar essa aula" para "a questão é
   * dura mesmo, a turma está na média".
   *
   * ⚠️ **Projeção mínima, pelo mesmo motivo do `getNumerosDasQuestoes`** (card
   * 03): são até 180 questões por relatório, e a `Questao` carrega enunciado,
   * alternativas e assets. Trazer o corpo inteiro para ler dois inteiros é
   * carga enorme num caminho que a tela abre a cada relatório.
   *
   * ⚠️ **Os ids têm de ser `ObjectId` válidos** — um inválido estoura
   * `BSONError` e derruba a aba de Questões inteira, não só uma linha. Sem
   * guarda de propósito: eles chegam do `agregarPorQuestao`, que os produz de
   * um `$group` sobre `respostas.questao`. Blindar aqui esconderia um defeito
   * de quem chamasse errado.
   *
   * ⚠️ **Os números só são confiáveis depois do card 21 (escrita) E do sync do
   * card 22 (passado).** Antes disso `quantidadeResposta` contava apresentações
   * e o reprocessamento contava duas vezes — medido: 0 de 181 questões batiam
   * com o histórico. Quem consome tem de saber disso.
   */
  public async contadoresGlobais(
    ids: string[],
  ): Promise<Map<string, { acertos: number; quantidadeResposta: number }>> {
    if (ids.length === 0) return new Map();
    const docs = await this.model
      .find(
        { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
        { acertos: 1, quantidadeResposta: 1 },
      )
      .lean()
      .exec();
    return new Map(
      docs.map((d: any) => [
        d._id.toString(),
        {
          // ⚠️ `?? 0` porque questão nunca respondida não tem os campos — e
          // ausente aqui É zero: ninguém respondeu, o que é uma afirmação
          // verdadeira, diferente do `null` que a tela usa para "base pequena".
          acertos: d.acertos ?? 0,
          quantidadeResposta: d.quantidadeResposta ?? 0,
        },
      ]),
    );
  }

  public async updateQuestionAnswered(
    respostas: Resposta[],
    /**
     * As respostas do processamento ANTERIOR deste mesmo histórico, a serem
     * descontadas. Vazio na primeira passada.
     *
     * ⚠️ Vêm relidas do documento, e ali `questao` é um **ObjectId cru**, não o
     * objeto populado — medido: `objectId` nas 2.230 linhas de homologação. É
     * por isso que o id passa pelo `resolveQuestaoId`; `resposta.questao._id`
     * daria `undefined` e o filtro casaria com nada.
     */
    anteriores: Resposta[] = [],
  ) {
    const contagem = new Map<
      string,
      { quantidadeResposta: number; acertos: number }
    >();

    const acumular = (lista: Resposta[], sinal: 1 | -1) => {
      for (const resposta of lista) {
        // ⚠️ Em branco e não lida ficam de fora — ver o item 1 do docblock.
        if (resposta.alternativaEstudante === undefined) continue;

        const id = resolveQuestaoId(resposta as never);
        const atual = contagem.get(id) ?? { quantidadeResposta: 0, acertos: 0 };
        atual.quantidadeResposta += sinal;

        /*
          ⚠️ `!== undefined` antes da comparação: redundante hoje porque a
          guarda acima já removeu as respostas em branco — ver o item 2 do
          docblock, que explica por que ela fica mesmo assim.
        */
        if (
          resposta.alternativaCorreta !== undefined &&
          resposta.alternativaCorreta === resposta.alternativaEstudante
        ) {
          atual.acertos += sinal;
        }
        contagem.set(id, atual);
      }
    };

    acumular(anteriores, -1);
    acumular(respostas, 1);

    const bulkOperations = [...contagem.entries()]
      /*
        ⚠️ Delta zero não vira escrita. É o caso comum do reprocessamento: a
        maior parte das questões foi lida igual das duas vezes, e um `$inc: 0`
        em 90 questões por cartão é I/O puro num caminho quente.
      */
      .filter(([, d]) => d.quantidadeResposta !== 0 || d.acertos !== 0)
      .map(([id, d]) => {
        const inc: Record<string, number> = {};
        if (d.quantidadeResposta !== 0)
          inc.quantidadeResposta = d.quantidadeResposta;
        if (d.acertos !== 0) inc.acertos = d.acertos;
        return { updateOne: { filter: { _id: id }, update: { $inc: inc } } };
      });

    // ⚠️ `bulkWrite([])` estoura no driver do Mongo.
    if (bulkOperations.length === 0) return;
    await this.model.bulkWrite(bulkOperations);
  }

  async updateAssets(id: string, assets: string[]) {
    await this.model.updateOne({ _id: id }, { assets });
  }

  async delete(_id: string) {
    await this.model.deleteOne({ _id });
  }

  async findProvasContendo(questaoId: string): Promise<Prova[]> {
    return await this.provaModel
      .find({ 'questoes.questao': questaoId })
      .populate('simulados')
      .exec();
  }

  async findQuestaoIdsByProva(provaId: string): Promise<string[]> {
    const prova = await this.provaModel.findById(provaId).select('questoes').exec();
    if (!prova) return [];
    return prova.questoes.map((qc) => resolveQuestaoId(qc));
  }

  async findProvasContendoMany(
    questaoIds: string[],
  ): Promise<Map<string, ProvaContendo[]>> {
    const provas = await this.provaModel
      .find({ 'questoes.questao': { $in: questaoIds } })
      .select('nome questoes')
      .exec();
    const map = new Map<string, ProvaContendo[]>();
    for (const prova of provas) {
      for (const qc of (prova as any).questoes) {
        const qId = resolveQuestaoId(qc);
        if (!questaoIds.includes(qId)) continue;
        if (!map.has(qId)) map.set(qId, []);
        map.get(qId)!.push({
          provaId: (prova as any)._id.toString(),
          provaNome: (prova as any).nome,
          numero: qc.numero,
        });
      }
    }
    return map;
  }

  async canInsertQuestion(
    provaId: string,
    numero: number,
    frente1: string,
  ): Promise<boolean> {
    const prova = await this.provaModel
      .findById(provaId)
      .populate('questoes.questao')
      .exec();
    if (!prova) return true;
    const jaExiste = prova.questoes.some(
      (qc: any) =>
        qc.numero === numero &&
        (qc.questao as any)?.frente1?.toString() === frente1,
    );
    return !jaExiste;
  }

  async getTotalEntity() {
    return this.model.find({ deletedAt: null }).count();
  }

  async entityByStatus(status: Status) {
    return this.model.find({ deletedAt: null, status }).countDocuments();
  }

  async getTotalEntityReported() {
    return this.model
      .find({ deletedAt: null, reported: true })
      .countDocuments();
  }

  async getTotalEntityClassified() {
    const query = this.model.find({ deletedAt: null });

    query.where({
      $or: [
        { provaClassification: true },
        { subjectClassification: true },
        { textClassification: true },
        { imageClassfication: true },
        { alternativeClassfication: true },
      ],
    });

    return query.countDocuments();
  }

  async pendingByMateria(materiaIds?: string[]): Promise<
    Array<{ materiaId: string; materiaName: string; count: number }>
  > {
    const match: Record<string, any> = {
      deletedAt: null,
      status: Status.Pending,
    };

    if (materiaIds?.length) {
      match.materia = { $in: materiaIds };
    }

    return this.model.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$materia',
          count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          _materiaOid: { $toObjectId: '$_id' },
        },
      },
      {
        $lookup: {
          from: 'materias',
          localField: '_materiaOid',
          foreignField: '_id',
          as: 'mat',
        },
      },
      { $unwind: '$mat' },
      {
        $project: {
          _id: 0,
          materiaId: { $toString: '$_id' },
          materiaName: '$mat.nome',
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);
  }
}
