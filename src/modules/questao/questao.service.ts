import { Injectable } from '@nestjs/common';
import { QuestaoRepository } from './questao.repository';
import { QuestaoDTOOutput } from './dtos/questao.dto.output';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { Questao } from './questao.schema';

@Injectable()
export class QuestaoService {
  constructor(private readonly repository: QuestaoRepository) {}

  public async add(item: CreateQuestaoDTOInput): Promise<QuestaoDTOOutput> {
    const questao = Object.assign(new Questao(), item);

    return Object.assign(
      new QuestaoDTOOutput(),
      await this.repository.create(questao),
    );
  }

  public async getById(id: string): Promise<QuestaoDTOOutput> {
    const questao = await this.repository.getById(id);
    const output = new QuestaoDTOOutput();
    return Object.assign(output, questao) as QuestaoDTOOutput;
  }

  public async getAll(): Promise<QuestaoDTOOutput[]> {
    const questoes = await this.repository.getAll();
    return questoes.map((questao) =>
      Object.assign(new QuestaoDTOOutput(), questao),
    );
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
