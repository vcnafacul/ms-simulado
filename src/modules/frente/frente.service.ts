import { Injectable } from '@nestjs/common';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateFrenteDTOInput } from './dtos/create.dto.input';
import { FrenteRepository } from './frente.repository';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteService {
  constructor(private readonly repository: FrenteRepository) {}

  public async add(item: CreateFrenteDTOInput): Promise<Frente> {
    const frente = Object.assign(new Frente(), item);
    return await this.repository.create(frente);
  }

  public async getById(id: string): Promise<Frente> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllDtoInput): Promise<GetAllDtoOutput<Frente>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
