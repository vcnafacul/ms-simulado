import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { Frente } from '../frente/frente.schema';
import { Questao } from '../questao/questao.schema';
import { CreateMateriaDTOInput } from './dtos/create.dto.input';
import { UpdateMateriaDTOInput } from './dtos/update.dto.input';
import { MateriaRepository } from './materia.repository';
import { Materia } from './materia.schema';

@Injectable()
export class MateriaService {
  constructor(
    private readonly repository: MateriaRepository,
    @InjectModel(Frente.name) private readonly frenteModel: Model<Frente>,
    @InjectModel(Questao.name) private readonly questaoModel: Model<Questao>,
  ) {}

  public async add(item: CreateMateriaDTOInput): Promise<Materia> {
    const materia = Object.assign(new Materia(), item);
    return await this.repository.create(materia);
  }

  public async getById(id: string): Promise<Materia> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Materia>> {
    return await this.repository.getAll(param);
  }

  public async update(id: string, dto: UpdateMateriaDTOInput): Promise<Materia> {
    const materia = await this.repository.getById(id);
    Object.assign(materia, dto);
    await this.repository.update(materia);
    return materia;
  }

  /**
   * Valida se a matéria pode ser excluída (soft delete).
   * Não permite exclusão se existir pelo menos uma frente ou questão vinculada.
   */
  public async validateCanDelete(materiaId: string): Promise<{
    canDelete: boolean;
    frentesCount: number;
    questoesCount: number;
    message?: string;
  }> {
    const objectId = new Types.ObjectId(materiaId);
    const [frentesCount, questoesCount] = await Promise.all([
      this.frenteModel.countDocuments({
        materia: objectId,
        deleted: { $ne: true },
      }),
      this.questaoModel.countDocuments({
        materia: objectId,
        deleted: { $ne: true },
      }),
    ]);
    const canDelete = frentesCount === 0 && questoesCount === 0;
    const parts: string[] = [];
    if (frentesCount > 0)
      parts.push(
        `${frentesCount} frente(s) vinculada(s)`,
      );
    if (questoesCount > 0)
      parts.push(
        `${questoesCount} questão(ões) vinculada(s)`,
      );
    const message =
      parts.length > 0
        ? `Não é possível excluir a matéria pois existem ${parts.join(' e ')}. Remova ou reatribua antes de excluir.`
        : undefined;
    return { canDelete, frentesCount, questoesCount, message };
  }

  public async delete(id: string): Promise<void> {
    const validation = await this.validateCanDelete(id);
    if (!validation.canDelete) {
      throw new BadRequestException(validation.message);
    }
    await this.repository.delete(id);
  }

  public async getGroupedByArea() {
    return this.repository.getGroupedByArea();
  }
}
