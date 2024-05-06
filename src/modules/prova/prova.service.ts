import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { ExameRepository } from '../exame/exame.repository';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetAllDTOOutput } from './dtos/get-all.dto.output';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';

@Injectable()
export class ProvaService {
  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
  ) {}

  public async create(item: CreateProvaDTOInput): Promise<Prova> {
    const exame = await this.exameRepository.getById(item.exame);
    const factory = this.provaFactory.getFactory(exame, item.ano);
    try {
      const prova = await factory.createProva(item);
      await factory.createSimulados(prova);

      return this.repository.create(prova);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  public async getAll(
    param: GetAllInput,
  ): Promise<GetAllOutput<GetAllDTOOutput>> {
    const provas = await this.repository.getAll(param);
    return {
      ...provas,
      data: provas.data.map((prova) => {
        return {
          _id: prova._id,
          edicao: prova.edicao,
          aplicacao: prova.aplicacao,
          ano: prova.ano,
          exame: prova.exame.nome,
          nome: prova.nome,
          totalQuestao: prova.totalQuestao,
          totalQuestaoValidadas: prova.totalQuestaoValidadas,
          filename: prova.filename,
          enemAreas: prova.enemAreas,
          totalQuestaoCadastradas: prova.questoes.length,
        };
      }),
    };
  }

  public async verifyNumber(
    id: string,
    numberQuestion: number,
  ): Promise<boolean> {
    const prova = await this.repository.getById(id);
    const factory = this.provaFactory.getFactory(prova.exame, prova.ano);
    try {
      return await factory.verifyNumberProva(prova._id, numberQuestion);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async approvedQuestion(id: string) {
    const prova = await this.repository.getById(id);
    prova.totalQuestaoValidadas += 1;
    await this.repository.update(prova);
  }

  public async refuseQuestion(id: string) {
    const prova = await this.repository.getById(id);
    prova.totalQuestaoValidadas -= 1;
    await this.repository.update(prova);
  }

  public async getMissingNumbers(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const factory = this.provaFactory.getFactory(prova.exame, prova.ano);
    return factory.getMissingNumbers(prova);
  }

  public async ValidatorProvaWithEnemArea(id: string, enemArea: EnemArea) {
    const prova = await this.repository.getById(id);
    if (
      (prova.nome.includes('Dia 1') &&
        ![EnemArea.CienciasHumanas, EnemArea.Linguagens].includes(enemArea)) ||
      (prova.nome.includes('Dia 2') &&
        ![EnemArea.BioExatas, EnemArea.Matematica].includes(enemArea))
    ) {
      throw new HttpException(
        'Area do conhecimento não coincide com a prova',
        HttpStatus.CONFLICT,
      );
    }
  }
}
