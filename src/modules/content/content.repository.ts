import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
}

@Injectable()
export class ContentRepository extends BaseRepository<Content> {
  constructor(@InjectModel(Content.name) model: Model<Content>) {
    super(model);
  }

  async findAllByFilter(
    filter: GetAllContentFilter,
  ): Promise<GetAllOutput<Content>> {
    const where: any = { deleted: { $ne: true } };
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.subject) where.subject = filter.subject;
    if (filter.title) where.title = { $regex: filter.title, $options: 'i' };

    const data = await this.model
      .find(where)
      .skip((filter.page - 1) * filter.limit)
      .limit(filter.limit ?? Infinity)
      .sort({ order: 1 });
    const totalItems = await this.model.where(where).countDocuments();

    return { data, page: filter.page, limit: filter.limit, totalItems };
  }

  async getByIdPopulated(id: string): Promise<Content> {
    return this.model.findById(id).populate({
      path: 'subject',
      populate: {
        path: 'frente',
        populate: { path: 'materia' },
      },
    });
  }

  async getBySubject(subjectId: string): Promise<Content[]> {
    return this.model
      .find({ subject: subjectId, deleted: { $ne: true } })
      .sort({ order: 1 });
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
            $sum: { $cond: [{ $eq: ['$status', StatusContent.Pending] }, 1, 0] },
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
