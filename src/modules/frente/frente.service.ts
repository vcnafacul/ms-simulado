import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { Types } from 'mongoose';
import {
  CreateFrenteDTOInput,
  UpdateFrenteDTOInput,
} from './dtos/create.dto.input';
import { FrenteRepository } from './frente.repository';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteService {
  constructor(private readonly repository: FrenteRepository) {}

  public async add(item: CreateFrenteDTOInput): Promise<Frente> {
    const frente = Object.assign(new Frente(), item);
    if (item.materia) {
      frente.materia = new Types.ObjectId(item.materia) as any;
    }
    return await this.repository.create(frente);
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
}
