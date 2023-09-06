import { Injectable } from '@nestjs/common';
import { MateriaRepository } from './materia.repository';
import { MateriaDTOOutput } from './dtos/materia.dto.output';
import { CreateMateriaDTOInput } from './dtos/create.dto.input';
import { Materia } from './materia.schema';

@Injectable()
export class MateriaService {
  constructor(private readonly repository: MateriaRepository) {}

  public async add(item: CreateMateriaDTOInput): Promise<MateriaDTOOutput> {
    const materia = Object.assign(new Materia(), item);

    return Object.assign(
      new MateriaDTOOutput(),
      await this.repository.create(materia),
    );
  }

  public async getById(id: string): Promise<MateriaDTOOutput> {
    const materia = await this.repository.getById(id);
    const output = new MateriaDTOOutput();
    output._id = materia._id;
    output.nome = materia.nome;
    return output;
  }

  public async getAll(): Promise<MateriaDTOOutput[]> {
    const materias = await this.repository.getAll();
    return materias.map((materia) => ({
      _id: materia._id,
      nome: materia.nome,
    }));
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
