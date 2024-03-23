import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { QuestaoRepository } from './questao.repository';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { Questao } from './questao.schema';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { Regra } from '../tipo-simulado/schemas/regra.schemas';
import { Status } from './enums/status.enum';
import { MateriaRepository } from '../materia/materia.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { ProvaRepository } from '../prova/prova.repository';
import { ExameRepository } from '../exame/exame.repository';
import { ProvaService } from '../prova/prova.service';
import { AuditLogService } from '../auditLog/auditLog.service';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

@Injectable()
export class QuestaoService {
  constructor(
    private readonly repository: QuestaoRepository,
    private readonly provaService: ProvaService,
    private readonly provaRepository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
    private readonly materiaRepository: MateriaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  public async create(item: CreateQuestaoDTOInput): Promise<Questao> {
    const newQuestion = Object.assign(new Questao(), item);
    if (
      !(await this.provaService.verifyNumber(item.prova, newQuestion.numero))
    ) {
      const questao = await this.repository.create(
        Object.assign(new Questao(), item),
      );
      await this.provaService.addQuestion(item.prova, questao);
      return questao;
    }
    throw new HttpException(
      `Possível questão já cadastrada com número ${item.numero}.`,
      HttpStatus.CONFLICT,
    );
  }

  public async getById(id: string): Promise<Questao> {
    const questao = await this.repository.getById(id);
    return questao;
  }

  public async getAll(
    param: GetAllInput,
    status?: Status,
  ): Promise<GetAllOutput<Questao>> {
    const questoes = await this.repository.getAll(param, status);
    return questoes;
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async GeyManyQuestao(tipo: TipoSimulado): Promise<Questao[]> {
    let questoes: Questao[] = [];
    await Promise.all(
      tipo.regras.map(async (regra) => {
        questoes = questoes.concat(await this.getQuestaoByRegras(regra));
      }),
    );

    if (tipo.quantidadeTotalQuestao > questoes.length) {
      questoes = questoes.concat(
        await this.getQuestoes(tipo.quantidadeTotalQuestao - questoes.length),
      );
    }
    await this.repository.IncrementaSimulado(questoes.map((q) => q._id));
    return questoes;
  }

  public async getInfos() {
    const param: GetAllInput = {
      page: 1,
      limit: 0,
    };
    const provas = await this.provaRepository.getAll(param);
    const exames = await this.exameRepository.getAll(param);
    const materias = await this.materiaRepository.getAll(param);
    const frentes = await this.frenteRepository.getAll(param);
    return { provas, exames, materias, frentes };
  }

  public async updateStatus(
    id: string,
    status: Status,
    userId: number,
    message?: string,
  ) {
    try {
      const question = await this.repository.getById(id);
      if (question.status === status) {
        throw new HttpException(
          'Não houve alteração de status',
          HttpStatus.NOT_MODIFIED,
        );
      }
      if (!question.prova) {
        throw new HttpException(
          'Para aprovar ou rejeitar, a prova não pode ser nula',
          HttpStatus.BAD_REQUEST,
        );
      }
      const prova = await this.provaRepository.getById(question.prova._id);
      if (status === Status.Approved) {
        await this.provaService.approvedQuestion(prova._id, question, prova);
      } else {
        await this.provaService.refuseQuestion(prova._id, question, prova);
      }
      await this.provaRepository.update(prova);
      await this.repository.UpdateStatus(id, status);
      await this.auditLogService.create({
        user: userId,
        entityId: question?._id,
        entityType: 'Questao',
        changes: JSON.stringify({
          status,
          message,
        }),
      });
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar a questão.  ${error.message}`,
        error.status,
      );
    }
  }

  public async updateQuestion(question: UpdateDTOInput) {
    const questao = await this.repository.getById(question._id);
    if (question.prova)
      this.provaService.ValidatorProvaWithEnemArea(
        question.prova,
        question.enemArea,
      );
    if (
      (question.prova && !questao.prova) ||
      (question.prova &&
        (question.prova !== questao.prova._id.toString() ||
          question.numero !== questao.numero))
    ) {
      await this.provaService.ValidatorProvaWithInfoQuestion(
        question.prova,
        question.numero,
        question._id,
      );
    }
    // Não existia prova antes
    if (!questao.prova) {
      if (!question.prova) {
        throw new HttpException(
          'Para  editar uma questão, uma prova deve ser definida',
          HttpStatus.CONFLICT,
        );
      }
      await this.provaService.addQuestion(question.prova, questao);
    } else if (question.prova !== undefined) {
      // Está alterando a prova da questão?
      if (
        question.prova !== questao.prova._id.toString() ||
        question.numero !== questao.numero
      ) {
        await this.provaService.ValidatorProvaWithInfoQuestion(
          question.prova,
          question.numero,
          question._id,
        );
      }
      if (
        question.prova !== questao.prova._id.toString() ||
        question.enemArea !== questao.enemArea
      ) {
        await this.provaService.removeQuestion(questao.prova._id, questao);
        await this.provaService.addQuestion(question.prova, {
          ...question,
          enemArea: question.enemArea,
          status: questao.status,
        } as unknown as Questao);
      }
    }
    await this.repository.updateQuestion(question);
  }

  private async getQuestaoByRegras(regra: Regra) {
    const regras = this.MontaFiltro(regra);
    return await this.getQuestoesByFiltro(regras, regra.quantidade as number);
  }

  private async getQuestoes(amount: number) {
    return await this.getQuestoesByFiltro({}, amount);
  }

  private async getQuestoesByFiltro(
    regras: { [key: string]: any },
    amount: number,
  ) {
    const questoes = await this.repository.getQuestaoByFiltro(regras, amount);
    if (questoes.length != amount) {
      throw new HttpException(
        `Não foi possível buscar o numero de questoes determinadas. ` +
          `Questoes Selecionada: ${questoes.length} - ` +
          `Questoes Totais Requeridas: ${amount}`,
        HttpStatus.NOT_FOUND,
      );
    }
    return questoes;
  }

  private MontaFiltro(regra: Regra) {
    const regras: { [key: string]: any } = {};
    regras['materia'] = regra.materia._id;
    if (regra.frente) regras['frente1'] = regra.frente._id;
    if (regra.ano) regras['ano'] = regra.ano;
    return regras;
  }
}
