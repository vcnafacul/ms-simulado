import { Injectable } from '@nestjs/common';
import { MateriaRepository } from './materia.repository';
import { CreateMateriaDTOInput } from './dtos/create.dto.input';
import { Materia } from './materia.schema';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

@Injectable()
export class MateriaService {
  constructor(private readonly repository: MateriaRepository) {}

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

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
