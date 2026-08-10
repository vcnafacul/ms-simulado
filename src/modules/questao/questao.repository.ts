import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

  async IncrementaSimulado(questoesId: string[]) {
    await this.model.updateMany(
      { _id: { $in: questoesId } }, // Correção aqui
      {
        $inc: { quantidadeSimulado: 1 },
      },
    );
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

  public async updateQuestionAnswered(respostas: Resposta[]) {
    const bulkOperations = respostas.map((resposta) => {
      const update: any = {
        $inc: {
          quantidadeResposta: 1,
        },
      };

      if (resposta.alternativaCorreta === resposta.alternativaEstudante) {
        update.$inc.acertos = 1;
      }

      return {
        updateOne: {
          filter: { _id: resposta.questao._id },
          update,
        },
      };
    });
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
