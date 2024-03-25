import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { ExameRepository } from '../exame/exame.repository';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { Status } from '../questao/enums/status.enum';
import { Questao } from '../questao/questao.schema';
import { SimuladoService } from '../simulado/simulado.service';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';

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
    await this.simuladoService.createByProva(prova);
    const newProva = await this.repository.create(prova);
    return newProva;
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Prova>> {
    const provas = await this.repository.getAll(param);
    return provas;
  }

  public async getByName(nome: string): Promise<Prova> {
    return await this.repository.getByFilter({ nome });
  }

  public async verifyNumber(
    id: string,
    numberQuestion: number,
    idQuestion?: string,
  ): Promise<boolean> {
    const prova = await this.repository.getProvaWithQuestion(id);
    if (
      idQuestion &&
      prova.questoes.some((quest) => quest._id.toString() === idQuestion)
    ) {
      return false;
    }
    return prova.questoes.some((quest) => quest.numero === numberQuestion);
  }

  public async addQuestion(id: string, question: Questao) {
    const prova = await this.repository.getById(id);
    prova.questoes.push(question);
    prova.totalQuestaoCadastradas += 1;
    if (question.status === Status.Approved) {
      await this.approvedQuestion(id, question, prova);
    }
    this.repository.update(prova);
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
        await this.refuseQuestion(id, oldQuestao, prova);
      }
      await this.repository.update(prova);
    }
  }

  public async approvedQuestion(
    id: string,
    question: Questao,
    provaRef?: Prova,
  ) {
    let prova;
    if (provaRef) prova = provaRef;
    else prova = await this.repository.getById(id);

    if (
      this.simuladoService.confirmAddQuestionSimulados(
        prova.simulado,
        question,
        prova.nome,
      )
    ) {
      throw new HttpException(
        'Não é possível inserir questões no simulado. Verifique se os simulados já estão completos',
        HttpStatus.CONFLICT,
      );
    }
    prova.totalQuestaoValidadas++;
    if (!provaRef) await this.repository.update(prova);
    await this.simuladoService.addQuestionSimulados(
      prova.simulado,
      question,
      prova.nome,
    );
  }

  public async refuseQuestion(id: string, question: Questao, provaRef?: Prova) {
    let prova;
    if (provaRef) prova = provaRef;
    else prova = await this.repository.getById(id);
    prova.totalQuestaoValidadas--;
    if (!provaRef) await this.repository.update(prova);
    await this.simuladoService.removeQuestionSimulados(
      prova.simulado,
      question,
      prova.nome,
    );
  }

  public async getMissingNumber(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const day1 = prova.nome.includes('Dia 1');
    const missingQuestion = [];
    for (
      let index = day1 ? 1 : 91;
      index <= (day1 ? prova.totalQuestao : prova.totalQuestao + 90);
      index++
    ) {
      if (!prova.questoes.find((quest) => quest.numero === index)) {
        missingQuestion.push(index);
      }
    }
    return missingQuestion;
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

  public async ValidatorProvaWithInfoQuestion(
    id: string,
    numberQuestion: number,
    IdQuestion?: string,
  ) {
    if (await this.verifyNumber(id, numberQuestion, IdQuestion)) {
      throw new HttpException(
        `Possível questão já cadastrada com número ${numberQuestion}.`,
        HttpStatus.CONFLICT,
      );
    }
  }
}
