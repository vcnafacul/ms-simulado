import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { EnemArea } from '../questao/enums/enem-area.enum';
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
          pipeline: [{ $match: { deleted: { $ne: true } } }],
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

  async getGroupedByArea(): Promise<
    {
      enemArea: string;
      materias: Pick<Materia, '_id' | 'nome' | 'icon' | 'image'>[];
    }[]
  > {
    const academicAreas = [
      EnemArea.Linguagens,
      EnemArea.CienciasHumanas,
      EnemArea.BioExatas,
      EnemArea.Matematica,
    ];

    return this.model.aggregate([
      { $match: { enemArea: { $in: academicAreas }, deleted: { $ne: true } } },
      {
        $group: {
          _id: '$enemArea',
          materias: {
            $push: {
              _id: '$_id',
              nome: '$nome',
              icon: '$icon',
              image: '$image',
            },
          },
        },
      },
      { $project: { _id: 0, enemArea: '$_id', materias: 1 } },
      { $sort: { enemArea: 1 } },
    ]);
  }
}
