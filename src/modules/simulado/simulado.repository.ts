import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Simulado } from './schemas/simulado.schema';

@Injectable()
export class SimuladoRepository extends BaseRepository<Simulado> {
  constructor(@InjectModel(Simulado.name) model: Model<Simulado>) {
    super(model);
  }

  async getById(id: string): Promise<Simulado | null> {
    return await this.model
      .findById(id)
      .populate('tipo')
      .populate({
        path: 'questoes',
        populate: ['frente1', 'materia'],
      })
      .exec();
  }

  override async delete(id: string) {
    const existingRecord = await this.model.updateOne(
      { _id: id },
      { $set: { bloqueado: true, deleted: true } },
    );
    if (!existingRecord) {
      throw new NotFoundException(`Registro com ID ${id} não encontrado.`);
    }
  }

  async answer(id: string): Promise<Simulado> {
    return await this.model
      .findById(id)
      .populate({
        path: 'questoes',
        populate: ['frente1', 'materia'],
        select: 'alternativa',
      })
      .exec();
  }

  override async getAll({
    page,
    limit,
  }: GetAllInput): Promise<GetAllOutput<Simulado>> {
    const data = await this.model
      .find()
      .populate(['tipo'])
      .skip((page - 1) * limit)
      .limit(limit);
    const totalItems = await this.model.countDocuments();
    return {
      data,
      page,
      limit,
      totalItems,
    };
  }

  async update(simulado: Simulado) {
    await this.model.updateOne({ _id: simulado._id }, simulado);
  }

  async updateSession(simulado: Simulado, session?: ClientSession) {
    await this.model.updateOne({ _id: simulado._id }, simulado, {
      session: session,
    });
  }

  async getAvailable(tipo: string) {
    return await this.model
      .find()
      .where({ tipo, bloqueado: false })
      .select(['nome', '_id']);
  }

  public removeDuplicatedSimulados(
    simuladosToCheck: Simulado[],
    simuladosToCompare: Simulado[],
  ): Simulado[] {
    const simulados = simuladosToCheck.filter((simulado) => {
      if (
        simuladosToCompare.find((simuladoToCompare) => {
          return simulado._id.toString() === simuladoToCompare._id.toString();
        })
      ) {
        return false;
      }
      return true;
    });
    return simulados;
  }

  async getTotalEntity() {
    return this.model.find({ deletedAt: null }).count();
  }

  async entityActived() {
    return this.model
      .find({ deletedAt: null, bloqueado: true })
      .countDocuments();
  }
}
