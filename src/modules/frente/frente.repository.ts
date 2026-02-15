import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteRepository extends BaseRepository<Frente> {
  constructor(@InjectModel(Frente.name) model: Model<Frente>) {
    super(model);
  }

  async getByMateria(materiaId: string): Promise<Frente[]> {
    return this.model.find({ materia: materiaId, deleted: { $ne: true } });
  }

  async getByMateriaWithApprovedContent(materiaId: string): Promise<any[]> {
    return this.model.aggregate([
      { $match: { materia: this.toObjectId(materiaId), deleted: { $ne: true } } },
      {
        $lookup: {
          from: 'subjects',
          localField: '_id',
          foreignField: 'frente',
          as: 'subjects',
          pipeline: [
            { $match: { deleted: { $ne: true } } },
            { $sort: { order: 1 } },
            {
              $lookup: {
                from: 'contents',
                localField: '_id',
                foreignField: 'subject',
                as: 'contents',
                pipeline: [
                  { $match: { status: 1, deleted: { $ne: true } } },
                  { $sort: { order: 1 } },
                ],
              },
            },
            { $match: { 'contents.0': { $exists: true } } },
          ],
        },
      },
      { $match: { 'subjects.0': { $exists: true } } },
    ]);
  }

  private toObjectId(id: string) {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId(id);
  }
}
