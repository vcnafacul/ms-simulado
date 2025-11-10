import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Resposta } from '../historico/types/resposta';
import { UpdateClassificacaoDTOInput } from './dtos/update-classificacao.dto.input';
import { UpdateContentDTOInput } from './dtos/update-content.dto.input';
import { UpdateImageAlternativaDTOInput } from './dtos/update-image-alternativa.dto.input';
import { UpdateImageIdDTOInput } from './dtos/update-image-id.dto.input';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';

@Injectable()
export class QuestaoRepository extends BaseRepository<Questao> {
  constructor(@InjectModel(Questao.name) model: Model<Questao>) {
    super(model);
  }

  override async getAll({
    page,
    limit,
    where,
    or,
  }: GetAllWhereInput): Promise<GetAllOutput<Questao>> {
    const query = this.model
      .find()
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .populate(['materia', 'prova'])
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

  async getByIdToUpdate(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'materia', 'prova']);
  }

  async getByIdToDelete(id: string) {
    return await this.model
      .findById(id)
      .select('+alternativa')
      .populate(['frente1', 'materia', 'prova'])
      .populate({
        path: 'prova',
        populate: 'simulados',
      });
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
      prova: classificacao.prova,
      numero: classificacao.numero,
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

  async delete(_id: string) {
    await this.model.deleteOne({ _id });
  }

  async canInsertQuestion(
    provaId: string,
    numero: number,
    frente1: string,
  ): Promise<boolean> {
    const questaoExistente = await this.model.findOne({
      prova: provaId,
      numero,
      frente1,
    });

    return !questaoExistente; // se já existe, não pode cadastrar → false
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
}
