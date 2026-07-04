import { Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { Categoria } from './schemas/categoria.schema';
import { CategoriaRepository } from './categoria.repository';

@Injectable()
export class CategoriaService {
  constructor(private readonly repository: CategoriaRepository) {}

  public async add(item: CreateCategoriaDTOInput): Promise<Categoria> {
    const categoria = Object.assign(new Categoria(), item);
    return await this.repository.create(categoria);
  }

  public async getById(id: string): Promise<Categoria> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Categoria>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
