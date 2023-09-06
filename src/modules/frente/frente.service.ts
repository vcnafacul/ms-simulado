import { Injectable } from '@nestjs/common';
import { FrenteRepository } from './frente.repository';
import { CreateFrenteDTOInput } from './dtos/create.dto.input';
import { FrenteDTOOutput } from './dtos/frente.dto.output';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteService {
  constructor(private readonly repository: FrenteRepository) {}

  public async add(item: CreateFrenteDTOInput): Promise<FrenteDTOOutput> {
    const frente = Object.assign(new Frente(), item);

    return Object.assign(
      new FrenteDTOOutput(),
      await this.repository.create(frente),
    );
  }

  public async getById(id: string): Promise<FrenteDTOOutput> {
    const frente = await this.repository.getById(id);
    const output = new FrenteDTOOutput();
    output._id = frente._id;
    output.nome = frente.nome;
    return output;
  }

  public async getAll(): Promise<FrenteDTOOutput[]> {
    const frentes = await this.repository.getAll();
    return frentes.map((frente) => ({
      _id: frente._id,
      nome: frente.nome,
    }));
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
