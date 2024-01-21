import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { QuestaoRepository } from './questao.repository';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { Questao } from './questao.schema';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { Regra } from '../tipo-simulado/schemas/regra.schemas';
import { ReportDTO } from './dtos/report.dto.input';
import { Status } from './enums/status.enum';
import { MateriaRepository } from '../materia/materia.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { ProvaRepository } from '../prova/prova.repository';
import { ExameRepository } from '../exame/exame.repository';
import { ProvaService } from '../prova/prova.service';
import { SimuladoService } from '../simulado/simulado.service';

@Injectable()
export class QuestaoService {
  constructor(
    private readonly repository: QuestaoRepository,
    private readonly provaService: ProvaService,
    private readonly simuladoService: SimuladoService,
    private readonly provaRepository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
    private readonly materiaRepository: MateriaRepository,
    private readonly frenteRepository: FrenteRepository,
  ) {}

  public async create(item: CreateQuestaoDTOInput): Promise<Questao> {
    const newQuestion = Object.assign(new Questao(), item);
    if (!(await this.provaService.verifyNumber(item.prova, newQuestion))) {
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

  public async getAll(status?: Status): Promise<Questao[]> {
    const questoes = await this.repository.getAll(status);
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

  public async report(reportDTO: ReportDTO) {
    console.log(reportDTO);
  }

  public async getInfos() {
    const provas = await this.provaRepository.getAll();
    const exames = await this.exameRepository.getAll();
    const materias = await this.materiaRepository.getAll();
    const frentes = await this.frenteRepository.getAll();
    return { provas, exames, materias, frentes };
  }

  public async updateStatus(id: string, status: Status) {
    const question = await this.repository.getById(id);
    if (question.status === status) {
      throw new HttpException(
        'Não houve alteração de status',
        HttpStatus.NOT_MODIFIED,
      );
    }
    if (!question.prova && status === Status.Approved) {
      throw new HttpException(
        'Para aprovar, a prova não pode ser nula',
        HttpStatus.BAD_REQUEST,
      );
    }
    const prova = await this.provaRepository.getById(question.prova._id);
    if (status === Status.Approved) {
      prova.totalQuestaoValidadas += 1;
      await this.simuladoService.addQuestionSimulados(
        prova.simulado,
        question,
        prova.nome,
      );
    } else {
      prova.totalQuestaoValidadas -= 1;
      await this.simuladoService.removeQuestionSimulados(
        prova.simulado,
        question,
        prova.nome,
      );
    }
    await this.repository.UpdateStatus(id, status);
    await this.provaRepository.update(prova);
  }

  public async updateQuestion(question: UpdateDTOInput) {
    const questao = await this.repository.getById(question._id);
    if (!questao.prova) {
      if (!question.prova) {
        throw new HttpException(
          'Para  editar uma questão, uma prova deve ser definida',
          HttpStatus.CONFLICT,
        );
      }
      if (
        await this.provaService.verifyNumber(question.prova, {
          ...questao.toJSON(),
          numero: question.numero,
        })
      ) {
        throw new HttpException(
          `Possível questão já cadastrada com número ${question.numero}.`,
          HttpStatus.CONFLICT,
        );
      }
      await this.provaService.addQuestion(question.prova, questao);
    } else if (
      question.prova !== undefined &&
      question.prova !== questao.prova._id.toString()
    ) {
      if (
        await this.provaService.verifyNumber(question.prova, {
          ...questao.toJSON(),
          numero: question.numero,
        })
      ) {
        throw new HttpException(
          `Possível questão já cadastrada com número ${question.numero}.`,
          HttpStatus.CONFLICT,
        );
      }
      await this.provaService.removeQuestion(questao.prova._id, questao);
      const oldProva = await this.provaRepository.getById(questao.prova._id);
      await this.simuladoService.removeQuestionSimulados(
        oldProva.simulado,
        questao,
        oldProva.nome,
      );
      await this.provaService.addQuestion(question.prova, questao);
      const newProva = await this.provaRepository.getById(question.prova);
      await this.simuladoService.addQuestionSimulados(
        newProva.simulado,
        questao,
        newProva.nome,
      );
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
