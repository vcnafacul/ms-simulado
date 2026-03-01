import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Materia } from './materia.schema';

@Injectable()
export class MateriaRepository extends BaseRepository<Materia> {
  constructor(@InjectModel(Materia.name) model: Model<Materia>) {
    super(model);
  }

  override async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Materia>> {
    const matchStage = where ? { $match: { ...where } } : { $match: {} };
    const pipeline: any[] = [
      matchStage,
      {
        $lookup: {
          from: 'frentes',
          localField: '_id',
          foreignField: 'materia',
          pipeline: [
            { $match: { deleted: { $ne: true } } },
          ],
          as: 'frentes',
        },
      },
    ];
    if (limit) {
      pipeline.push({ $limit: Number(limit) });
    }
    const data = await this.model.aggregate(pipeline);
    const totalItems = await this.model.where({ ...where }).countDocuments();
    return { data: data as Materia[], page, limit, totalItems };
  }
}
