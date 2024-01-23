import { Injectable } from '@nestjs/common';
import { SimuladoRepository } from './repository/simulado.repository';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { Simulado } from './schemas/simulado.schema';
// import { EnemArea } from '../questao/enums/enem-area.enum';
// import { toPascalCaseSemAcentos } from 'src/utils/string';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { AnswerSimulado } from './dtos/answer-simulado.dto.input';
import { RespostaRepository } from './repository/resposta.repository';
import { RespostaSimulado } from './schemas/resposta-simulado.schema';
import { Prova } from '../prova/prova.schema';
import { Questao } from '../questao/questao.schema';
import { EnemArea } from '../questao/enums/enem-area.enum';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly repository: SimuladoRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly respostaRepository: RespostaRepository, // private readonly questaoService: QuestaoService,
  ) {}

  public async createByProva(prova: Prova) {
    prova.simulado = [];
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    if (prova.tipo.nome === EnemArea.Enem1) {
      prova.simulado.push(await this.createArea(mainName, EnemArea.Linguagens));
      prova.simulado.push(
        await this.createArea(mainName, EnemArea.CienciasHumanas),
      );
    } else if (prova.tipo.nome === EnemArea.Enem2) {
      prova.simulado.push(await this.createArea(mainName, EnemArea.BioExatas));
      prova.simulado.push(await this.createArea(mainName, EnemArea.Matematica));
    }
    prova.simulado.push(
      await this.repository.create({
        nome: mainName,
        tipo: prova.tipo,
        questoes: [],
        descricao: prova.exame.nome,
      }),
    );
  }

  public async getById(id: string): Promise<Simulado | null> {
    return await this.repository.getById(id);
  }

  public async getAll(): Promise<Simulado[]> {
    return await this.repository.getAll();
  }

  public async delete(id: string) {
    await this.repository.delete(id);
  }

  public async getToAnswer(
    simuladoId: string,
  ): Promise<SimuladoAnswerDTOOutput> {
    try {
      return await this.GetSimulado(simuladoId);
    } catch (error) {
      return null;
    }
  }

  public async addQuestionSimulados(
    simulados: Simulado[],
    question: Questao,
    nomeProva: string,
  ) {
    const promise = Promise.all(
      simulados.map((sml) => {
        if (
          sml.nome.includes(question.enemArea) ||
          sml.nome === nomeProva.substring(0, 15)
        ) {
          this.addQuestion(sml._id, question);
        }
      }),
    );
    await promise;
  }

  public async removeQuestionSimulados(
    simulados: Simulado[],
    question: Questao,
    nomeProva: string,
  ) {
    const promise = Promise.all(
      simulados.map((sml) => {
        if (
          sml.nome.includes(question.enemArea) ||
          sml.nome === nomeProva.substring(0, 15)
        ) {
          this.removeQuestion(sml._id, question);
        }
      }),
    );
    await promise;
  }

  public async addQuestion(id: string, question: Questao) {
    const simulado = await this.repository.getById(id);
    simulado.questoes.push(question);
    if (simulado.tipo.quantidadeTotalQuestao === simulado.questoes.length) {
      simulado.bloqueado = false;
    }
    this.repository.update(simulado);
  }

  public async removeQuestion(id: string, oldQuestao: Questao) {
    const simulado = await this.repository.getById(id);
    const index = simulado.questoes.findIndex(
      (questao) => questao._id.toString() === oldQuestao._id.toString(),
    );
    if (index !== -1) {
      simulado.questoes.splice(index, 1);
      simulado.bloqueado = true;
      await this.repository.update(simulado);
    }
  }

  private async createArea(defaultName: string, nameTipo: string) {
    const simuladoArea = new Simulado();
    const tipo = await this.tipoSimuladoRepository.getByFilter({
      nameTipo,
    });
    simuladoArea.tipo = tipo;
    simuladoArea.nome = `${defaultName} ${nameTipo}`;
    simuladoArea.questoes = [];
    return await this.repository.create(simuladoArea);
  }

  public async answer(answer: AnswerSimulado) {
    const simulado = await this.repository.answer(answer.idSimulado);

    const respostas = simulado?.questoes.map((questao) => {
      const resposta = answer.respostas.find(
        (r) => r.questao === questao._id.toString(),
      );
      return {
        questao: questao._id.toString(),
        alternativaEstudante: resposta?.alternativaEstudante,
        alternativaCorreta: questao.alternativa,
      };
    });
    const respostaSimulado: RespostaSimulado = {
      idEstudante: answer.idEstudante,
      idSimulado: answer.idSimulado,
      respostas: respostas,
    };
    await this.respostaRepository.create(respostaSimulado);
  }

  private async GetSimulado(id: string) {
    const inicio = new Date(new Date().getTime() + 5);
    const simulado = await this.GetSimuladoById(id, inicio);
    return simulado;
  }

  private async GetSimuladoById(
    id: string,
    inicio: Date,
  ): Promise<SimuladoAnswerDTOOutput> {
    const simulado = await this.repository.getById(id);
    return !simulado
      ? null
      : {
          _id: simulado._id,
          nome: simulado.nome,
          descricao: simulado.descricao,
          tipo: simulado.tipo._id,
          questoes: simulado.questoes.map((q) => ({
            _id: q._id,
            enemArea: q.enemArea,
            frente1: q.frente1,
            frente2: q.frente2,
            frente3: q.frente3,
            materia: q.materia,
            numero: q.numero,
            imageId: q.imageId,
            prova: q.prova,
          })),
          inicio: inicio,
          duracao: simulado.tipo.duracao,
        };
  }
}
