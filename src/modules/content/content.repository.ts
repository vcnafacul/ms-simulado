import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Frente } from 'src/modules/frente/frente.schema';
import { Subject } from 'src/modules/questao/subject/subject.schema';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Content } from './content.schema';
import { StatusContent } from './enums/status-content.enum';

interface GetAllContentFilter {
  page: number;
  limit: number;
  status?: StatusContent;
  subject?: string;
  title?: string;
  materia?: string;
}

@Injectable()
export class ContentRepository extends BaseRepository<Content> {
  constructor(
    @InjectModel(Content.name) model: Model<Content>,
    @InjectModel(Subject.name) private readonly subjectModel: Model<Subject>,
    @InjectModel(Frente.name) private readonly frenteModel: Model<Frente>,
  ) {
    super(model);
  }

  async findAllByFilter(
    filter: GetAllContentFilter,
  ): Promise<GetAllOutput<Content>> {
    const where: any = { deleted: { $ne: true } };
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.subject) where.subject = filter.subject;
    if (filter.title) where.title = { $regex: filter.title, $options: 'i' };

    if (filter.materia) {
      const subjectIds = await this.getSubjectIdsByMateria(filter.materia);
      where.subject = { $in: subjectIds };
    }

    const data = await this.model
      .find(where)
      .populate({
        path: 'subject',
        populate: { path: 'frente' },
      })
      .populate('file')
      .skip((filter.page - 1) * filter.limit)
      .limit(filter.limit ?? Infinity)
      .sort({ order: 1 });
    const totalItems = await this.model.where(where).countDocuments();

    return { data, page: filter.page, limit: filter.limit, totalItems };
  }

  private async getSubjectIdsByMateria(materiaId: string): Promise<string[]> {
    const materiaObjectId = new Types.ObjectId(materiaId);
    const frentes = await this.frenteModel
      .find({ materia: materiaObjectId, deleted: { $ne: true } })
      .select('_id')
      .lean();
    const frenteIds = frentes.map((f) => f._id.toString());
    const subjects = await this.subjectModel
      .find({ frente: { $in: frenteIds }, deleted: { $ne: true } })
      .select('_id')
      .lean();
    return subjects.map((s) => s._id.toString());
  }

  async getByIdPopulated(id: string): Promise<Content> {
    return this.model
      .findById(id)
      .populate({
        path: 'subject',
        populate: {
          path: 'frente',
          populate: { path: 'materia' },
        },
      })
      .populate('file');
  }

  /**
   * Conteúdos de um tema, na ordem. Com `status`, só os daquele status —
   * é assim que a página do tema do aluno recebe só os aprovados.
   *
   * ⚠️ Sem `status` devolve TODOS (menos excluídos), como sempre devolveu:
   * o painel admin pode depender disso.
   */
  async getBySubject(
    subjectId: string,
    status?: StatusContent,
  ): Promise<Content[]> {
    const where: Record<string, unknown> = {
      subject: subjectId,
      deleted: { $ne: true },
    };
    if (status !== undefined) where.status = status;
    return this.model
      .find(where)
      .populate({
        path: 'subject',
        populate: { path: 'frente' },
      })
      .populate('file')
      .sort({ order: 1 });
  }

  /**
   * ⚠️ `$unset` explícito: o `update` do `BaseRepository` faz
   * `updateOne(filtro, entidade)`, e o Mongoose descarta chave `undefined` —
   * `content.file = undefined` + `update(content)` deixaria o arquivo lá.
   */
  async resetarParaPendenteDeEnvio(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: { status: StatusContent.Pending_Upload },
        $unset: { file: 1, rejectionReason: 1, approvedBy: 1, approvedAt: 1 },
      },
    );
  }

  /**
   * Troca o status e cuida do que vai junto: o motivo só existe em
   * `Rejected`; o aprovador (`approvedBy`/`approvedAt`) só em `Approved`.
   * ⚠️ `$unset`, pelo mesmo motivo do reset — `undefined` no `update()` não
   * remove nada.
   */
  async mudarStatus(
    id: string,
    status: StatusContent,
    rejectionReason?: string,
    aprovador?: { userId: string; em: Date },
  ): Promise<void> {
    const set: Record<string, unknown> = { status };
    const unset: Record<string, 1> = {};
    if (status === StatusContent.Rejected && rejectionReason) {
      set.rejectionReason = rejectionReason;
    } else {
      unset.rejectionReason = 1;
    }
    if (status === StatusContent.Approved && aprovador) {
      set.approvedBy = aprovador.userId;
      set.approvedAt = aprovador.em;
    } else {
      unset.approvedBy = 1;
      unset.approvedAt = 1;
    }
    await this.model.updateOne({ _id: id }, { $set: set, $unset: unset });
  }

  /** Arquivo novo apaga o motivo da rejeição e o aprovador: a demanda recomeça. */
  async limparMotivoDaRejeicao(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      { $unset: { rejectionReason: 1, approvedBy: 1, approvedAt: 1 } },
    );
  }

  async getNextOrder(subjectId: string): Promise<number> {
    const last = await this.model
      .findOne({ subject: subjectId, deleted: { $ne: true } })
      .sort({ order: -1 });
    return last ? last.order + 1 : 0;
  }

  async isUnique(subjectId: string, title: string): Promise<boolean> {
    const existing = await this.model.findOne({
      subject: subjectId,
      title,
      deleted: { $ne: true },
    });
    return !existing;
  }

  async bulkUpdateOrder(items: { id: string; order: number }[]): Promise<void> {
    const ops = items.map(({ id, order }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order } },
      },
    }));
    await this.model.bulkWrite(ops);
  }

  async countByStatus(status: StatusContent): Promise<number> {
    return this.model.countDocuments({ status, deleted: { $ne: true } });
  }

  async countTotal(): Promise<number> {
    return this.model.countDocuments({ deleted: { $ne: true } });
  }

  async getStatsByFrente(): Promise<any[]> {
    return this.model.aggregate([
      { $match: { deleted: { $ne: true } } },
      {
        $lookup: {
          from: 'subjects',
          localField: 'subject',
          foreignField: '_id',
          as: 'subjectData',
        },
      },
      { $unwind: '$subjectData' },
      {
        $lookup: {
          from: 'frentes',
          localField: 'subjectData.frente',
          foreignField: '_id',
          as: 'frenteData',
        },
      },
      { $unwind: '$frenteData' },
      {
        $group: {
          _id: '$frenteData._id',
          frente: { $first: '$frenteData.nome' },
          materia: { $first: '$frenteData.materia' },
          pendentes: {
            $sum: {
              $cond: [{ $eq: ['$status', StatusContent.Pending] }, 1, 0],
            },
          },
          aprovados: {
            $sum: {
              $cond: [{ $eq: ['$status', StatusContent.Approved] }, 1, 0],
            },
          },
          reprovados: {
            $sum: {
              $cond: [{ $eq: ['$status', StatusContent.Rejected] }, 1, 0],
            },
          },
          pendentes_upload: {
            $sum: {
              $cond: [{ $eq: ['$status', StatusContent.Pending_Upload] }, 1, 0],
            },
          },
          total: { $sum: 1 },
        },
      },
    ]);
  }

  async getSnapshotData(): Promise<{
    data: Date;
    pendentes: number;
    aprovados: number;
    reprovados: number;
    pendentes_upload: number;
    total: number;
  }> {
    const pendentes = await this.countByStatus(StatusContent.Pending);
    const aprovados = await this.countByStatus(StatusContent.Approved);
    const reprovados = await this.countByStatus(StatusContent.Rejected);
    const pendentes_upload = await this.countByStatus(
      StatusContent.Pending_Upload,
    );
    const total = await this.countTotal();

    return {
      data: new Date(),
      pendentes,
      aprovados,
      reprovados,
      pendentes_upload,
      total,
    };
  }
}
