import { Injectable } from '@nestjs/common';
import { Exame } from './exame.schema';
import { ExameRepository } from './exame.repository';
import { ExameDto } from './dtos/exame.dto';

@Injectable()
export class ExameService {
  constructor(private readonly repository: ExameRepository) {}

  public async add(item: ExameDto): Promise<Exame> {
    const exame = new Exame();
    Object.assign(exame, item);
    return await this.repository.create(exame);
  }

  public async getById(id: string): Promise<Exame> {
    const exame = this.repository.getById(id);
    return exame;
  }

  public async getAll(): Promise<Exame[]> {
    return this.repository.getAll();
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
