import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { HistoricoRepository } from '../historico/historico.repository';
import { Historico } from '../historico/historico.schema';
import {
  AproveitamentoHistorico,
  MateriaAproveitamento,
  SubAproveitamento,
} from '../historico/types/aproveitamento';
import { MateriaRepository } from '../materia/materia.repository';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao } from '../questao/questao.schema';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { AnswerSimuladoDto } from './dtos/answer-simulado.dto.input';
import { AvailableSimuladoDTOoutput } from './dtos/available-simulado.dto.output';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { Simulado } from './schemas/simulado.schema';
import { SimuladoRepository } from './simulado.repository';
import { RespostaAproveitamento } from './valueObject/resposta-aproveitamento';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questoesRepository: QuestaoRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly historicoRepository: HistoricoRepository,
    private readonly materiaRepository: MateriaRepository,
  ) {}

  public async getById(id: string): Promise<Simulado | null> {
    return await this.simuladoRepository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Simulado>> {
    return await this.simuladoRepository.getAll(param);
  }

  public async delete(id: string) {
    await this.simuladoRepository.delete(id);
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
    session?: ClientSession,
  ) {
    await Promise.all(
      simulados.map(async (sml) => {
        // Adiciona a nova questão
        sml.questoes.push(question);

        // Verifica se o simulador atingiu a quantidade total de questões
        const atingiuQuantidadeTotal =
          sml.questoes.length === sml.tipo.quantidadeTotalQuestao;
        // Verifica se todas as questões estão aprovadas
        const todasAprovadas = sml.questoes.every(
          (q) => q.status === Status.Approved,
        );

        // Define bloqueado como false somente se todas as questões foram adicionadas e estão aprovadas
        sml.bloqueado = !(atingiuQuantidadeTotal && todasAprovadas);

        // Retorna a promessa para o update
        return await this.simuladoRepository.updateSession(sml, session);
      }),
    );
  }

  public async removeQuestionSimulados(
    simulados: Simulado[],
    question: Questao,
    session: ClientSession = undefined,
  ) {
    await Promise.all(
      simulados.map(async (sml) => {
        const index = sml.questoes.findIndex(
          (questao) => questao._id.toString() === question._id.toString(),
        );
        if (index !== -1) {
          sml.questoes.splice(index, 1);
          sml.bloqueado = true;
          await this.simuladoRepository.updateSession(sml, session);
        }
      }),
    );
  }

  public async answer(answer: AnswerSimuladoDto) {
    const simulado = await this.simuladoRepository.answer(answer.idSimulado);

    const ano = (
      await this.questoesRepository.getById(simulado.questoes[0]._id)
    ).prova.ano;

    const respostas: RespostaAproveitamento[] = simulado?.questoes.map(
      (questao) => {
        const resposta = answer.respostas.find(
          (r) => r.questao === questao._id.toString(),
        );
        return {
          questao: questao,
          alternativaEstudante: resposta?.alternativaEstudante,
          alternativaCorreta: questao.alternativa,
          materia: questao.materia,
          frente: questao.frente1,
        };
      },
    );

    const aproveitamento = await this.criaAproveitamento(respostas);
    const historico: Historico = {
      usuario: answer.idEstudante,
      ano: ano,
      simulado: simulado,
      aproveitamento: aproveitamento,
      questoesRespondidas: answer.respostas.length,
      respostas: respostas.map((r) => ({
        questao: r.questao,
        alternativaEstudante: r.alternativaEstudante,
        alternativaCorreta: r.alternativaCorreta,
      })),
      tempoRealizado: answer.tempoRealizado,
    };

    await this.questoesRepository.updateQuestionAnswered(respostas);
    await this.historicoRepository.create(historico);
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
    const simulado = await this.simuladoRepository.getById(id);
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

  public async getAvailable(
    nomeTipo: string,
  ): Promise<AvailableSimuladoDTOoutput[]> {
    const tipo = await this.tipoSimuladoRepository.getByFilter({
      nome: nomeTipo,
    });
    return await this.simuladoRepository.getAvailable(tipo._id);
  }

  private async criaAproveitamento(
    respostas: RespostaAproveitamento[],
  ): Promise<AproveitamentoHistorico> {
    let aproveitamentoGeral = 0;

    // Extrai matérias únicas presentes nas respostas
    const materiasUnicas = new Map<string, MateriaAproveitamento>();

    respostas.forEach((res) => {
      const materiaId = res.materia._id.toString();

      // Inicializa a matéria se ainda não existir
      if (!materiasUnicas.has(materiaId)) {
        materiasUnicas.set(materiaId, {
          id: res.materia._id,
          nome: res.materia.nome,
          aproveitamento: 0,
          frentes: [],
        });
      }

      const materia = materiasUnicas.get(materiaId);

      // Adiciona a frente se ainda não existir nesta matéria
      const frenteId = res.frente._id.toString();
      if (!materia.frentes.some((f) => f.id.toString() === frenteId)) {
        materia.frentes.push({
          id: res.frente._id,
          nome: res.frente.nome,
          aproveitamento: 0,
          materia: res.materia.nome,
        });
      }
    });

    // Converte o Map para array
    const materias = Array.from(materiasUnicas.values());

    // Calcula o aproveitamento
    respostas.forEach((res) => {
      if (res.alternativaCorreta === res.alternativaEstudante) {
        aproveitamentoGeral++;
        this.increasePerformance(
          res,
          materias.find((m) => m.id.toString() === res.materia._id.toString()),
        );
      }
    });

    // Calcula o aproveitamento de cada matéria e frente
    materias.forEach((m) => {
      const quantidade = respostas.filter(
        (elem) => elem.materia._id.toString() === m.id.toString(),
      ).length;

      m.aproveitamento = quantidade > 0 ? m.aproveitamento / quantidade : 0;

      m.frentes.forEach((f) => {
        const quantidade = respostas.filter(
          (elem) => elem.frente._id.toString() === f.id.toString(),
        ).length;

        f.aproveitamento = quantidade > 0 ? f.aproveitamento / quantidade : 0;
      });
    });

    return {
      geral: aproveitamentoGeral / respostas.length,
      materias: materias,
    };
  }

  private increasePerformance(
    res: RespostaAproveitamento,
    materia: MateriaAproveitamento,
  ) {
    materia.aproveitamento++;
    this.calculaAproveitamento(res.frente._id.toString(), materia.frentes);
  }

  private calculaAproveitamento(id: string, array: Array<SubAproveitamento>) {
    if (id) {
      const index: number = array.findIndex((a) => a.id == id);
      if (index > -1) {
        array[index].aproveitamento++;
      }
    }
  }

  async getSummary() {
    const simuladosTotais = await this.simuladoRepository.getTotalEntity();
    const simuladosActived = await this.simuladoRepository.entityActived();

    return {
      simuladosTotais,
      simuladosActived,
    };
  }
}
