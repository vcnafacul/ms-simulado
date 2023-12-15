import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { ExameRepository } from '../exame/exame.repository';

@Injectable()
export class ProvaService {
  constructor(
    private readonly repository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
  ) {}

  public async add(item: CreateProvaDTOInput): Promise<Prova> {
    const exame = await this.exameRepository.getById(item.exame);
    const prova = new Prova(item, exame);
    prova.nome = `${exame.nome}_${prova.ano}_${prova.edicao}_${prova.aplicacao}`;
    const hasProva = await this.getByName(prova.nome);
    if (!!hasProva) {
      throw new HttpException('Prova já esta cadastrada', HttpStatus.CONFLICT);
    }
    prova.ano = item.ano;
    prova.aplicacao = item.aplicacao;
    prova.exame = exame;
    prova.edicao = item.edicao;
    prova.totalQuestao = item.totalQuestao;
    const newProva = await this.repository.create(prova);
    return newProva;
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  public async getAll(): Promise<Prova[]> {
    const provas = await this.repository.getAll();
    return provas;
  }

  public async getByName(nome: string): Promise<Prova> {
    return await this.repository.getByFilter({ nome });
  }
}
