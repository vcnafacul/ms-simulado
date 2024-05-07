import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { HistoricoRepository } from '../historico/historico.repository';
import { Historico } from '../historico/historico.schema';
import {
  Aproveitamento,
  SubAproveitamento,
} from '../historico/types/aproveitamento';
import { Resposta } from '../historico/types/resposta';
import { Status } from '../questao/enums/status.enum';
import { Questao } from '../questao/questao.schema';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { AnswerSimuladoDto } from './dtos/answer-simulado.dto.input';
import { AvailableSimuladoDTOoutput } from './dtos/available-simulado.dto.output';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { SimuladoRepository } from './repository/simulado.repository';
import { Simulado } from './schemas/simulado.schema';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly repository: SimuladoRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly historicoRepository: HistoricoRepository,
  ) {}

  public async getById(id: string): Promise<Simulado | null> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Simulado>> {
    return await this.repository.getAll(param);
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
    session: ClientSession = undefined,
  ) {
    const promise = Promise.all(
      simulados.map((sml) => {
        sml.questoes.push(question);
        sml.bloqueado = true;
        if (sml.tipo.quantidadeTotalQuestao === sml.questoes.length) {
          sml.bloqueado = false;
          if (sml.questoes.some((q) => q.status !== Status.Approved)) {
            sml.bloqueado = true;
          }
        }
        this.repository.updateSession(sml, session);
      }),
    );
    await promise;
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
          await this.repository.updateSession(sml, session);
        }
      }),
    );
  }

  public async answer(answer: AnswerSimuladoDto) {
    const simulado = await this.repository.answer(answer.idSimulado);

    const respostas: Resposta[] = simulado?.questoes.map((questao) => {
      const resposta = answer.respostas.find(
        (r) => r.questao === questao._id.toString(),
      );
      return {
        questao: questao,
        alternativaEstudante: resposta?.alternativaEstudante,
        alternativaCorreta: questao.alternativa,
      };
    });

    const aproveitamento = this.criaAproveitamento(respostas);
    const historico: Historico = {
      usuario: answer.idEstudante,
      simulado: simulado,
      aproveitamento: aproveitamento,
      questoesRespondidas: answer.respostas.length,
      respostas: respostas,
      tempoRealizado: answer.tempoRealizado,
    };

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

  public async getAvailable(
    nomeTipo: string,
  ): Promise<AvailableSimuladoDTOoutput[]> {
    const tipo = await this.tipoSimuladoRepository.getByFilter({
      nome: nomeTipo,
    });
    return await this.repository.getAvailable(tipo._id);
  }

  private criaAproveitamento(respostas: Resposta[]): Aproveitamento {
    let aproveitamentoGeral = 0;

    const materias: SubAproveitamento[] = [];
    respostas.forEach((r) => {
      const exist = materias.find(
        (m) => m?.id?.toString() === r.questao.materia._id.toString(),
      );
      if (!exist) {
        materias.push({
          id: r.questao.materia._id,
          nome: r.questao.materia.nome,
          aproveitamento: 0,
        } satisfies SubAproveitamento);
      }
    });

    const frentes: SubAproveitamento[] = [];

    respostas.forEach((r) => {
      const existFrente1 = frentes.find(
        (f) => f?.id?.toString() === r.questao.frente1._id.toString(),
      );
      if (!existFrente1) {
        frentes.push({
          id: r.questao.frente1._id,
          nome: r.questao.frente1.nome,
          aproveitamento: 0,
        } satisfies SubAproveitamento);
      }
      if (
        r.questao.frente2 &&
        !frentes.find(
          (f) => f?.id?.toString() === r.questao.frente2?._id.toString(),
        )
      ) {
        frentes.push({
          id: r.questao.frente2._id,
          nome: r.questao.frente2.nome,
          aproveitamento: 0,
        } satisfies SubAproveitamento);
      }
      if (
        r.questao.frente3 &&
        !frentes.find(
          (f) => f?.id?.toString() === r.questao.frente3?._id.toString(),
        )
      ) {
        frentes.push({
          id: r.questao.frente3._id,
          nome: r.questao.frente3.nome,
          aproveitamento: 0,
        } satisfies SubAproveitamento);
      }
    });

    respostas.forEach((res) => {
      if (res.alternativaCorreta === res.alternativaEstudante) {
        aproveitamentoGeral++;
        this.calculaAproveitamento(
          res.questao.materia._id,
          res.questao.materia.nome,
          materias,
        );
        this.calculaAproveitamento(
          res.questao.frente1._id,
          res.questao.frente1.nome,
          frentes,
        );
        this.calculaAproveitamento(
          res.questao.frente2?._id,
          res.questao.frente2?.nome,
          frentes,
        );
        this.calculaAproveitamento(
          res.questao.frente3?._id,
          res.questao.frente3?.nome,
          frentes,
        );
      }
    });

    materias.forEach((m) => {
      const quantidade = respostas.reduce(
        (total, elem) =>
          elem.questao.materia._id === m.id ? total + 1 : total,
        0,
      );
      m.aproveitamento = m.aproveitamento / quantidade;
    });

    frentes.forEach((f) => {
      const quantidade = respostas.reduce(
        (total, elem) =>
          [
            elem.questao.frente1._id,
            elem.questao.frente2?._id,
            elem.questao.frente3?._id,
          ].includes(f.id)
            ? total + 1
            : total,
        0,
      );
      f.aproveitamento = f.aproveitamento / quantidade;
    });

    return {
      geral: aproveitamentoGeral / respostas.length,
      materias: materias,
      frentes: frentes,
    };
  }

  private calculaAproveitamento(
    id: string,
    nome: string,
    array: Array<SubAproveitamento>,
  ) {
    if (id) {
      const index: number = array.findIndex((a) => a.id == id);
      if (index > -1) {
        array[index].aproveitamento++;
      }
    }
  }
}
