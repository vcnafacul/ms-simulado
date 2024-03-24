import { Injectable } from '@nestjs/common';
import { TipoSimuladoRepository } from './tipo-simulado.repository';
import { CreateTipoSimuladoDTOInput } from './dtos/create.dto.input';
import { TipoSimulado } from './schemas/tipo-simulado.schema';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

@Injectable()
export class TipoSimuladoService {
  constructor(private readonly repository: TipoSimuladoRepository) {}

  public async add(item: CreateTipoSimuladoDTOInput): Promise<TipoSimulado> {
    const tipo = Object.assign(new TipoSimulado(), item);

    return await this.repository.create(tipo);
  }

  public async getById(id: string): Promise<TipoSimulado> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<TipoSimulado>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
