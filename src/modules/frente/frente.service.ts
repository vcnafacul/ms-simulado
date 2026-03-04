import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { MateriaRepository } from '../materia/materia.repository';
import { Questao } from '../questao/questao.schema';
import { Subject } from '../questao/subject/subject.schema';
import {
  CreateFrenteDTOInput,
  UpdateFrenteDTOInput,
} from './dtos/create.dto.input';
import { FrenteRepository } from './frente.repository';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteService {
  constructor(
    private readonly repository: FrenteRepository,
    private readonly materiaRepository: MateriaRepository,
    @InjectModel(Subject.name) private readonly subjectModel: Model<Subject>,
    @InjectModel(Questao.name) private readonly questaoModel: Model<Questao>,
  ) {}

  public async add(item: CreateFrenteDTOInput): Promise<Frente> {
    const frente = Object.assign(new Frente(), item);
    if (!item.materia) {
      throw new HttpException('Matéria não encontrada', HttpStatus.NOT_FOUND);
    }
    const materia = await this.materiaRepository.getById(item.materia);
    frente.materia = materia._id as any;
    const newFrente = await this.repository.create(frente);
    return newFrente;
  }

  public async getById(id: string): Promise<Frente> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllDtoInput): Promise<GetAllDtoOutput<Frente>> {
    return await this.repository.getAll(param);
  }

  public async update(id: string, dto: UpdateFrenteDTOInput): Promise<void> {
    const frente = await this.repository.getById(id);
    if (!frente) {
      throw new HttpException(
        `Frente não encontrada com ID ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }
    const updated = Object.assign(frente, dto);
    await this.repository.update(updated);
  }

  public async getByMateria(materiaId: string): Promise<Frente[]> {
    return await this.repository.getByMateria(materiaId);
  }

  public async getByMateriaWithApprovedContent(
    materiaId: string,
  ): Promise<any[]> {
    return this.repository.getByMateriaWithApprovedContent(materiaId);
  }

  public async delete(id: string): Promise<void> {
    const frente = await this.repository.getById(id);
    if (!frente) {
      throw new HttpException(
        `Frente não encontrada com ID ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const subjectCount = await this.subjectModel.countDocuments({
      frente: id,
      deleted: { $ne: true },
    });
    if (subjectCount > 0) {
      throw new HttpException(
        `Não é possível excluir a frente: existem ${subjectCount} subject(s) vinculado(s)`,
        HttpStatus.CONFLICT,
      );
    }

    const questaoCount = await this.questaoModel.countDocuments({
      $or: [{ frente1: id }, { frente2: id }, { frente3: id }],
      deleted: { $ne: true },
    });
    if (questaoCount > 0) {
      throw new HttpException(
        `Não é possível excluir a frente: existem ${questaoCount} questão(ões) vinculada(s)`,
        HttpStatus.CONFLICT,
      );
    }

    await this.repository.delete(id);
  }
}
