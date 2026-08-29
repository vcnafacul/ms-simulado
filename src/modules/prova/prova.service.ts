import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';
import { UpdateProvaFilesDTO } from './dtos/update-files.dto.input';
import { atingiuQuantidade } from '../simulado/helpers/bloqueado';
import { syncNumeroNaProvaESimulados } from './helpers/question-container.helpers';

@Injectable()
export class ProvaService {
  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly categoriaRepository: CategoriaRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
  ) {}

  public async create(item: CreateProvaDTOInput): Promise<GetProvaDTOOutout> {
    const categoria = await this.categoriaRepository.getById(item.categoria);
    const factory = this.provaFactory.getFactory(categoria, item.ano);
    try {
      const prova = await factory.createProva(item);
      await factory.createSimulados(prova);

      const result = await this.repository.create(prova);
      return {
        _id: result._id,
        edicao: result.edicao,
        aplicacao: result.aplicacao,
        ano: result.ano,
        categoria: result.categoria.nome,
        exame: result.categoria.exame.nome,
        nome: result.nome,
        totalQuestao: result.totalQuestao,
        totalQuestaoCadastradas: result.questoes.length,
        totalQuestaoValidadas: result.totalQuestaoValidadas,
        filename: result.filename,
        gabarito: result.gabarito,
        enemAreas: result.enemAreas,
        createdAt: result.createdAt,
      } as GetProvaDTOOutout;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  public async syncNumero(
    provaId: string,
    questaoId: string,
    numero: number | null,
  ): Promise<void> {
    await syncNumeroNaProvaESimulados(
      this.repository,
      this.simuladoRepository,
      provaId,
      questaoId,
      numero,
    );
  }

  private toProvaDTO(prova: Prova): GetProvaDTOOutout {
    return {
      _id: prova._id,
      edicao: prova.edicao,
      aplicacao: prova.aplicacao,
      ano: prova.ano,
      categoria: prova.categoria.nome,
      exame: prova.categoria.exame.nome,
      nome: prova.nome,
      totalQuestao: prova.totalQuestao,
      gabarito: prova.gabarito,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      enemAreas: prova.enemAreas,
      totalQuestaoCadastradas: prova.questoes.length,
      createdAt: prova.createdAt,
    } as GetProvaDTOOutout;
  }

  public async getAll(
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll(param);
    return {
      ...provas,
      data: provas.data.map((prova) => this.toProvaDTO(prova)),
    };
  }

  public async getAllByCursinho(
    cursinhoId: string,
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll({
      ...param,
      where: { cursinhoId },
    });
    return {
      ...provas,
      data: provas.data.map((prova) => this.toProvaDTO(prova)),
    };
  }

  public async approvedQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas contando a questão sendo aprovada
    prova.totalQuestaoValidadas = prova.questoes.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return true;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.find(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        const hasRequiredCount = atingiuQuantidade(
          simulado.categoria.quantidadeTotalQuestao,
          simulado.questoes.length,
        );
        const allApproved = simulado.questoes.every(
          (qc) =>
            qc.questao.status === Status.Approved ||
            qc.questao._id.toString() === questionId,
        );

        simulado.bloqueado = !(hasRequiredCount && allApproved);
        if (!simulado.bloqueado) {
          simulado.questoes = simulado.questoes.sort(
            (a, b) => a.numero - b.numero,
          );
        }
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async refuseQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas excluindo a questão sendo rejeitada
    prova.totalQuestaoValidadas = prova.questoes.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return false;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.some(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // Recalcula bloqueado considerando a questão sendo rejeitada
        const hasRequiredCount = atingiuQuantidade(
          simulado.categoria.quantidadeTotalQuestao,
          simulado.questoes.length,
        );
        const allApproved =
          hasRequiredCount &&
          simulado.questoes.every((qc) => {
            if (qc.questao._id.toString() === questionId) return false;
            return qc.questao.status === Status.Approved;
          });

        simulado.bloqueado = !allApproved;
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async getMissingNumbers(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const factory = this.provaFactory.getFactory(prova.categoria, prova.ano);
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

  public async updateFiles(
    id: string,
    dto: UpdateProvaFilesDTO,
  ): Promise<GetProvaDTOOutout> {
    const prova = await this.repository.getById(id);

    if (!prova) {
      throw new HttpException('Prova não encontrada', HttpStatus.NOT_FOUND);
    }
    if (!dto.filename && !dto.gabarito) {
      throw new HttpException(
        'Nenhum campo para atualizar',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.filename) {
      prova.filename = dto.filename;
    }

    if (dto.gabarito) {
      prova.gabarito = dto.gabarito;
    }

    await this.repository.update(prova);

    return {
      _id: prova._id,
      edicao: prova.edicao,
      aplicacao: prova.aplicacao,
      ano: prova.ano,
      categoria: prova.categoria.nome,
      exame: prova.categoria.exame.nome,
      nome: prova.nome,
      totalQuestao: prova.totalQuestao,
      totalQuestaoCadastradas: prova.questoes.length,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      gabarito: prova.gabarito,
      enemAreas: prova.enemAreas,
      createdAt: prova.createdAt,
    } as GetProvaDTOOutout;
  }
}
