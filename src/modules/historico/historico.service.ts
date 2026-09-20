import { Injectable } from '@nestjs/common';
import { AggregatePeriodDtoInput } from 'src/shared/dtos/aggregate-period.dto.input';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { GetPerformanceHistories } from './dtos/get-perfomance-histories.dto';
import { descreverFalha } from './falha/mapa-falha';
import { HistoricoRepository } from './historico.repository';
import {
  AproveitamentoGeral,
  AproveitamentoHistorico,
  SubAproveitamento,
} from './types/aproveitamento';

/** Mongoose doc ou objeto puro → objeto puro. O repositório devolve documentos
 *  hidratados em produção e objetos simples nos testes. */
function toPlain(doc: unknown): any {
  return (doc as any)?.toObject ? (doc as any).toObject() : doc;
}

@Injectable()
export class HistoricoService {
  constructor(private repository: HistoricoRepository) {}

  async getAllbyUser(dto: GetHistoricoDTOInput) {
    const resultado = await this.repository.getAllByUser(dto);
    return {
      ...resultado,
      data: resultado.data.map((historico) => {
        const obj: any = toPlain(historico);
        return { ...obj, falha: descreverFalha(obj.falha) };
      }),
    };
  }

  /**
   * ⚠️ `usuario` obrigatório: esta rota serve o estudante vendo o PRÓPRIO
   * histórico. Sem ele, qualquer usuário autenticado lia o de qualquer outro
   * pelo id — respostas marcadas, gabarito e aproveitamento por matéria.
   *
   * ⚠️ E a recusa é `null` (que vira 404 na ponta), não um erro de autorização:
   * `findOne` sem resultado já é indistinguível de "não existe", e um 403
   * confirmaria a existência do histórico alheio a quem perguntou.
   */
  async getById(id: string, usuario: string) {
    const historico = await this.repository.getByIdAndUsuario(id, usuario);
    if (!historico) return historico;
    const obj: any = toPlain(historico);
    if (obj.simulado && Array.isArray(obj.simulado.questoes)) {
      // Achata pro shape antigo do client, preservando o numero do relacionamento
      // (numero vive em QuestaoNaContainer, não mais na Questao).
      obj.simulado.questoes = obj.simulado.questoes.map((qc: any) => ({
        ...qc.questao,
        numero: qc.numero,
      }));
    }
    obj.falha = descreverFalha(obj.falha);
    return obj;
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
          materiaTimesMap.set(materia.nome, times);
        }

        // Atualiza ou adiciona a média das frentes no frentesMap
        materia.frentes.forEach((frente) => {
          if (!frentesMap.has(frente.nome)) {
            frentesMap.set(frente.nome, { ...frente });
            frenteTimesMap.set(frente.nome, 1);
          } else {
            const frenteExistente = frentesMap.get(frente.nome)!;
            let times = frenteTimesMap.get(frente.nome)!;
            frenteExistente.aproveitamento =
              (times * frenteExistente.aproveitamento + frente.aproveitamento) /
              (times + 1);
            times = times + 1;
            frenteTimesMap.set(frente.nome, times);
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

  async aggregateByPeriod({ groupBy }: AggregatePeriodDtoInput) {
    return await this.repository.aggregateByPeriod({ groupBy });
  }

  async aggregateByPeriodAndTipo({ groupBy }: AggregatePeriodDtoInput) {
    return await this.repository.aggregateByPeriodAndTipo({ groupBy });
  }
}
