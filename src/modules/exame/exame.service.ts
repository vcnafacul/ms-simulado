import { Injectable } from '@nestjs/common';
import { Exame } from './exame.schema';
import { ExameRepository } from './exame.repository';
import { CreateExameDtoInput } from './dtos/create.dto.input';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

@Injectable()
export class ExameService {
  constructor(private readonly repository: ExameRepository) {}

  public async add(item: CreateExameDtoInput): Promise<Exame> {
    const exame = new Exame();
    Object.assign(exame, item);
    return await this.repository.create(exame);
  }

  public async getById(id: string): Promise<Exame> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Exame>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  /* private convertDomain(domain: Exame): ExameDto {
    return {
      _id: domain._id,
      nome: domain.nome,
      localizacao: domain.localizacao as Localizacao,
    };
  } */
}
