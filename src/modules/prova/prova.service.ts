import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { ExameRepository } from '../exame/exame.repository';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { Status } from '../questao/enums/status.enum';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';

@Injectable()
export class ProvaService {
  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
    private readonly simuladoRepository: SimuladoRepository,
  ) {}

  public async create(item: CreateProvaDTOInput): Promise<GetProvaDTOOutout> {
    const exame = await this.exameRepository.getById(item.exame);
    const factory = this.provaFactory.getFactory(exame, item.ano);
    try {
      const prova = await factory.createProva(item);
      await factory.createSimulados(prova);

      const result = await this.repository.create(prova);
      return {
        _id: result._id,
        edicao: result.edicao,
        aplicacao: result.aplicacao,
        ano: result.ano,
        exame: result.exame.nome,
        nome: result.nome,
        totalQuestao: result.totalQuestao,
        totalQuestaoCadastradas: result.questoes.length,
        totalQuestaoValidadas: result.totalQuestaoValidadas,
        filename: result.filename,
        gabartio: result.gabarito,
        enemAreas: result.enemAreas,
      } as GetProvaDTOOutout;
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
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
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
          gabartio: prova.gabarito,
          totalQuestaoValidadas: prova.totalQuestaoValidadas,
          filename: prova.filename,
          enemAreas: prova.enemAreas,
          totalQuestaoCadastradas: prova.questoes.length,
        };
      }),
    };
  }

  public async approvedQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);
    prova.totalQuestaoValidadas += 1;
    await Promise.all(
      prova.simulados.map(async (simulado) => {
        if (
          simulado.questoes.find((q) => q._id.toString() === questionId) &&
          simulado.questoes.length === simulado.tipo.quantidadeTotalQuestao &&
          !simulado.questoes.some(
            (q) =>
              q.status !== Status.Approved && q._id.toString() !== questionId,
          )
        ) {
          simulado.bloqueado = false;
          const organizationQuestions = simulado.questoes.sort(
            (a, b) => a.numero - b.numero,
          );
          simulado.questoes = organizationQuestions;
        }
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async refuseQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);
    prova.totalQuestaoValidadas -= 1;
    await Promise.all(
      prova.simulados.map(async (simulado) => {
        if (simulado.questoes.some((q) => q._id.toString() === questionId)) {
          simulado.bloqueado = true;
        }
        await this.simuladoRepository.update(simulado);
      }),
    );
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

  async getSummary() {
    const provaTotal = await this.repository.getTotalEntity();
    return {
      provaTotal,
    };
  }
}
