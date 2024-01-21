import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { ExameRepository } from '../exame/exame.repository';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { SimuladoService } from '../simulado/simulado.service';
import { Questao } from '../questao/questao.schema';
import { Status } from '../questao/enums/status.enum';

@Injectable()
export class ProvaService {
  constructor(
    private readonly repository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly simuladoService: SimuladoService,
  ) {}

  public async create(item: CreateProvaDTOInput): Promise<Prova> {
    const exame = await this.exameRepository.getById(item.exame);
    const tipo = await this.tipoSimuladoRepository.getById(item.tipo);
    const prova = new Prova(item, exame, tipo);
    prova.nome = `${tipo.nome} ${prova.ano} ${prova.edicao} ${prova.aplicacao}`;
    const hasProva = await this.getByName(prova.nome);
    if (!!hasProva) {
      throw new HttpException('Prova já esta cadastrada', HttpStatus.CONFLICT);
    }
    prova.simulado = await this.simuladoService.createByProva(prova);
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

  public async verifyNumber(id: string, questao: Questao): Promise<boolean> {
    const prova = await this.repository.getProvaWithQuestion(id);
    return prova.questoes.some(
      (quest) =>
        quest.numero === questao.numero ||
        quest._id.toString() === questao._id.toString(),
    );
  }

  public async addQuestion(id: string, question: Questao) {
    const prova = await this.repository.getById(id);
    prova.questoes.push(question);
    prova.totalQuestaoCadastradas += 1;
    if (question.status === Status.Approved) {
      prova.totalQuestaoValidadas += 1;
    }
    this.repository.update(prova);
    await this.simuladoService.addQuestionSimulados(
      prova.simulado,
      question,
      prova.nome,
    );
  }

  public async removeQuestion(id: string, oldQuestao: Questao) {
    const prova = await this.repository.getById(id);
    const index = prova.questoes.findIndex(
      (questao) => questao._id.toString() === oldQuestao._id.toString(),
    );
    if (index !== -1) {
      prova.questoes.splice(index, 1);
      prova.totalQuestaoCadastradas -= 1;
      if (oldQuestao.status === Status.Approved) {
        prova.totalQuestaoValidadas -= 1;
      }
      await this.repository.update(prova);
    }
    await this.simuladoService.removeQuestionSimulados(
      prova.simulado,
      oldQuestao,
      prova.nome,
    );
  }

  public async getMissingNumber(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const missingQuestion = [];
    for (let index = 1; index <= prova.totalQuestao; index++) {
      if (!prova.questoes.find((quest) => quest.numero === index)) {
        missingQuestion.push(index);
      }
    }
    return missingQuestion;
  }
}
