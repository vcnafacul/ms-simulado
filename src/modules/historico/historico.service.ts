import { Injectable } from '@nestjs/common';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { GetPerformanceHistories } from './dtos/get-perfomance-histories.dto';
import { HistoricoRepository } from './historico.repository';
import {
  AproveitamentoGeral,
  AproveitamentoHistorico,
  SubAproveitamento,
} from './types/aproveitamento';

@Injectable()
export class HistoricoService {
  constructor(private repository: HistoricoRepository) {}

  async getAllbyUser(dto: GetHistoricoDTOInput) {
    return await this.repository.getAllByUser(dto);
  }

  async getById(id: string) {
    return await this.repository.getById(id);
  }

  async getPerformance(userId: string): Promise<GetPerformanceHistories> {
    const getHistoricos = await this.repository.getToPerformance(userId);
    const aproveitamentoGeralMateriaFrente = this.calcularMediaAproveitamento(
      getHistoricos.map((historico) => historico.aproveitamento),
    );
    const historicos = getHistoricos.map((historico) => ({
      historyId: historico._id,
      testName: historico.simulado.nome,
      performance: historico.aproveitamento,
      timeSpent: historico.tempoRealizado,
      questionsAnswered: historico.questoesRespondidas,
      totalQuestionsTest: historico.simulado.questoes.length,
      testPerformance: historico.simulado.aproveitamento,
      testAttempts: historico.simulado.vezesRespondido,
      createdAt: historico.createdAt,
    }));
    return {
      performanceMateriaFrente: aproveitamentoGeralMateriaFrente,
      historicos,
    };
  }

  private calcularMediaAproveitamento(
    aproveitamentos: AproveitamentoHistorico[],
  ): AproveitamentoGeral {
    const aproveitamentoUnico: AproveitamentoGeral = {
      geral: 0,
      materias: [],
      frentes: [],
    };

    // Calculando a média geral
    aproveitamentoUnico.geral =
      aproveitamentos.reduce((soma, atual) => soma + atual.geral, 0) /
      aproveitamentos.length;

    // Mapas para armazenar matérias e frentes
    const materiasMap = new Map<string, SubAproveitamento>();
    const materiaTimesMap = new Map<string, number>();
    const frentesMap = new Map<string, SubAproveitamento>();
    const frenteTimesMap = new Map<string, number>();

    aproveitamentos.forEach((aproveitamento) => {
      aproveitamento.materias.forEach((materia) => {
        // Atualiza ou adiciona a média das matérias no materiasMap
        if (!materiasMap.has(materia.nome)) {
          materiasMap.set(materia.nome, { ...materia });
          materiaTimesMap.set(materia.nome, 1);
        } else {
          const materiaExistente = materiasMap.get(materia.nome)!;
          let times = materiaTimesMap.get(materia.nome)!;
          materiaExistente.aproveitamento =
            (times * materiaExistente.aproveitamento + materia.aproveitamento) /
            (times + 1);
          times = times + 1;
        }

        // Atualiza ou adiciona a média das frentes no frentesMap
        materia.frentes.forEach((frente) => {
          if (!frentesMap.has(frente.nome)) {
            frentesMap.set(frente.nome, { ...frente });
            frenteTimesMap.set(frente.nome, 1);
          } else {
            const frenteExistente = frentesMap.get(frente.nome)!;
            const times = frenteTimesMap.get(frente.nome)!;
            frenteExistente.aproveitamento =
              (times * frenteExistente.aproveitamento + frente.aproveitamento) /
              (times + 1);
          }
        });
      });
    });

    // Convertendo os mapas para arrays
    materiasMap.forEach((materia) => {
      const materiaComFrentes = {
        ...materia,
      };
      aproveitamentoUnico.materias.push(materiaComFrentes);
    });

    frentesMap.forEach((frente) => {
      aproveitamentoUnico.frentes.push(frente);
    });

    return aproveitamentoUnico;
  }

  async getSummary() {
    const historicTotal = await this.repository.getTotalEntity();
    const historicCompleted = await this.repository.entityCompleted();

    return {
      historicTotal,
      historicCompleted,
    };
  }
}
