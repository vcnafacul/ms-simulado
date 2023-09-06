import { Injectable } from '@nestjs/common';
import { TipoSimuladoRepository } from './tipo-simulado.repository';
import { CreateTipoSimuladoDTOInput } from './dtos/create.dto.input';
import { TipoSimuladoDTOOutput } from './dtos/tipo-simulado.dto.output';
import { TipoSimulado } from './schemas/tipo-simulado.schema';

@Injectable()
export class TipoSimuladoService {
  constructor(private readonly repository: TipoSimuladoRepository) {}

  public async add(
    item: CreateTipoSimuladoDTOInput,
  ): Promise<TipoSimuladoDTOOutput> {
    const tipo = Object.assign(new TipoSimulado(), item);

    return Object.assign(
      new TipoSimuladoDTOOutput(),
      await this.repository.create(tipo),
    );
  }

  public async getById(id: string): Promise<TipoSimuladoDTOOutput> {
    const tipo = await this.repository.getById(id);
    const output = new TipoSimuladoDTOOutput();
    return Object.assign(output, tipo) as TipoSimuladoDTOOutput;
  }

  public async getAll(): Promise<TipoSimuladoDTOOutput[]> {
    const tipos = await this.repository.getAll();
    return tipos.map((tipo) =>
      Object.assign(new TipoSimuladoDTOOutput(), tipo),
    );
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
