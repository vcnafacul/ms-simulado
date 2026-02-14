import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { ExameRepository } from '../exame/exame.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { Frente } from '../frente/frente.schema';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao } from '../questao/questao.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
import {
  ProvaFixEntry,
  SimuladoFixEntry,
  SyncReport,
  SyncStatus,
} from './dtos/sync-report.dto';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';

@Injectable()
export class ProvaService {
  private syncReport: SyncReport | null = null;
  private isSyncing = false;

  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly frenteRepository: FrenteRepository,
  ) {}

  public async create(item: CreateProvaDTOInput): Promise<GetProvaDTOOutout> {
    const exame = await this.exameRepository.getById(item.exame);
    const factory = this.provaFactory.getFactory(exame, item.ano);
    try {
      const prova = await factory.createProva(item);
      await factory.createSimulados(prova);

      const result = await this.repository.create(prova);
      return {
        _id: result._id,
        edicao: result.edicao,
        aplicacao: result.aplicacao,
        ano: result.ano,
        exame: result.exame.nome,
        nome: result.nome,
        totalQuestao: result.totalQuestao,
        totalQuestaoCadastradas: result.questoes.length,
        totalQuestaoValidadas: result.totalQuestaoValidadas,
        filename: result.filename,
        gabartio: result.gabarito,
        enemAreas: result.enemAreas,
      } as GetProvaDTOOutout;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  public async getAll(
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll(param);
    return {
      ...provas,
      data: provas.data.map((prova) => {
        return {
          _id: prova._id,
          edicao: prova.edicao,
          aplicacao: prova.aplicacao,
          ano: prova.ano,
          exame: prova.exame.nome,
          nome: prova.nome,
          totalQuestao: prova.totalQuestao,
          gabartio: prova.gabarito,
          totalQuestaoValidadas: prova.totalQuestaoValidadas,
          filename: prova.filename,
          enemAreas: prova.enemAreas,
          totalQuestaoCadastradas: prova.questoes.length,
        };
      }),
    };
  }

  public async approvedQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas contando a questão sendo aprovada
    prova.totalQuestaoValidadas = prova.questoes.filter((q) => {
      if (q._id.toString() === questionId) return true;
      return q.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.find(
          (q) => q._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        const hasRequiredCount =
          simulado.questoes.length === simulado.tipo.quantidadeTotalQuestao;
        const allApproved = simulado.questoes.every(
          (q) =>
            q.status === Status.Approved || q._id.toString() === questionId,
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
    prova.totalQuestaoValidadas = prova.questoes.filter((q) => {
      if (q._id.toString() === questionId) return false;
      return q.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.some(
          (q) => q._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // Recalcula bloqueado considerando a questão sendo rejeitada
        const hasRequiredCount =
          simulado.questoes.length === simulado.tipo.quantidadeTotalQuestao;
        const allApproved =
          hasRequiredCount &&
          simulado.questoes.every((q) => {
            if (q._id.toString() === questionId) return false;
            return q.status === Status.Approved;
          });

        simulado.bloqueado = !allApproved;
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async getMissingNumbers(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const factory = this.provaFactory.getFactory(prova.exame, prova.ano);
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

  public startSync(): { status: SyncStatus; message: string } {
    if (this.isSyncing) {
      throw new HttpException(
        'Sincronizacao ja em andamento',
        HttpStatus.CONFLICT,
      );
    }

    this.isSyncing = true;
    this.executeSync();

    return { status: 'processing', message: 'Sincronizacao iniciada' };
  }

  public getSyncReport(): SyncReport | { status: SyncStatus } {
    if (this.isSyncing) {
      return { status: 'processing' };
    }
    if (!this.syncReport) {
      return { status: 'idle' };
    }
    return this.syncReport;
  }

  private async executeSync(): Promise<void> {
    const report: SyncReport = {
      status: 'processing',
      processedAt: null,
      totalProvas: 0,
      provasFixed: [],
      simuladosFixed: [],
      errors: [],
    };

    try {
      // Busca frentes de idioma uma vez para toda a sync
      const [frenteIngles, frenteEspanhol] = await Promise.all([
        this.frenteRepository.getByFilter({ nome: 'Inglês' }),
        this.frenteRepository.getByFilter({ nome: 'Espanhol' }),
      ]);

      const provas = await this.repository.getAllPopulated();
      report.totalProvas = provas.length;

      // Busca TODAS as questoes que referenciam essas provas
      const provaIds = provas.map((p) => p._id.toString());
      const allQuestoes =
        await this.questaoRepository.getAllByProvaIds(provaIds);

      // Agrupa questoes por prova
      const questoesByProva = new Map<string, Questao[]>();
      for (const q of allQuestoes) {
        const provaId = q.prova?.toString() || '';
        if (!questoesByProva.has(provaId)) {
          questoesByProva.set(provaId, []);
        }
        questoesByProva.get(provaId).push(q);
      }

      for (const prova of provas) {
        try {
          const provaFixes: ProvaFixEntry = {
            provaId: prova._id,
            provaNome: prova.nome,
            fixes: [],
          };

          // Passo A: Reconstruir prova.questoes a partir das questoes que apontam para esta prova
          const questoesDaProva =
            questoesByProva.get(prova._id.toString()) || [];
          const oldQuestaoIds = (prova.questoes || [])
            .filter((q) => q !== null && q._id !== undefined)
            .map((q) => q._id.toString())
            .sort();
          const newQuestaoIds = questoesDaProva
            .map((q) => q._id.toString())
            .sort();
          const questoesChanged =
            JSON.stringify(oldQuestaoIds) !== JSON.stringify(newQuestaoIds);

          if (questoesChanged) {
            provaFixes.fixes.push({
              field: 'questoes',
              issue: 'incorrect_count',
              oldValue: oldQuestaoIds.length,
              newValue: newQuestaoIds.length,
              detail: `Reconstruido array de questoes da prova`,
            });
          }
          prova.questoes = questoesDaProva as any;

          // Passo B: Recalcular totalQuestaoValidadas
          const actualApproved = questoesDaProva.filter(
            (q) => q.status === Status.Approved,
          ).length;
          if (prova.totalQuestaoValidadas !== actualApproved) {
            provaFixes.fixes.push({
              field: 'totalQuestaoValidadas',
              issue: 'incorrect_count',
              oldValue: prova.totalQuestaoValidadas,
              newValue: actualApproved,
            });
            prova.totalQuestaoValidadas = actualApproved;
          }

          // Passo C: Reconstruir questoes de cada simulado
          const validSimulados = (prova.simulados || []).filter(
            (s) => s !== null && s._id !== undefined,
          );
          for (const simulado of validSimulados) {
            const simuladoFixes: SimuladoFixEntry = {
              simuladoId: simulado._id,
              simuladoNome: simulado.nome,
              fixes: [],
            };

            // C1: Reconstruir simulado.questoes baseado na logica de selecao
            const newSimQuestoes = this.selectQuestionsForSimulado(
              simulado,
              questoesDaProva,
              prova,
              frenteIngles,
              frenteEspanhol,
            );
            const oldSimQuestaoIds = (simulado.questoes || [])
              .filter((q) => q !== null && q._id !== undefined)
              .map((q) => q._id.toString())
              .sort();
            const newSimQuestaoIds = newSimQuestoes
              .map((q) => q._id.toString())
              .sort();
            const simQuestoesChanged =
              JSON.stringify(oldSimQuestaoIds) !==
              JSON.stringify(newSimQuestaoIds);

            if (simQuestoesChanged) {
              simuladoFixes.fixes.push({
                field: 'questoes',
                issue: 'incorrect_count',
                oldValue: oldSimQuestaoIds.length,
                newValue: newSimQuestaoIds.length,
                detail: `Reconstruido array de questoes do simulado`,
              });
            }

            // C2: Recalcular bloqueado
            const hasRequiredCount = simulado.tipo
              ? newSimQuestoes.length === simulado.tipo.quantidadeTotalQuestao
              : false;
            const allApproved =
              newSimQuestoes.length > 0 &&
              newSimQuestoes.every((q) => q.status === Status.Approved);
            const shouldBeBlocked = !(hasRequiredCount && allApproved);

            if (simulado.bloqueado !== shouldBeBlocked) {
              simuladoFixes.fixes.push({
                field: 'bloqueado',
                issue: 'incorrect_value',
                oldValue: simulado.bloqueado,
                newValue: shouldBeBlocked,
                detail: !simulado.tipo
                  ? 'tipo e nulo, definido bloqueado=true'
                  : `questoes: ${newSimQuestoes.length}/${simulado.tipo.quantidadeTotalQuestao}, todasAprovadas: ${allApproved}`,
              });
            }

            // C3: Atualizar simulado com questoes reconstruidas e ordenadas
            simulado.questoes = newSimQuestoes.sort(
              (a, b) => a.numero - b.numero,
            ) as any;
            simulado.bloqueado = shouldBeBlocked;

            // C4: Sempre persistir simulado para garantir consistencia
            await this.simuladoRepository.update(simulado);
            if (simuladoFixes.fixes.length > 0) {
              report.simuladosFixed.push(simuladoFixes);
            }
          }

          // Passo D: Sempre persistir prova para garantir consistencia
          await this.repository.update(prova);
          if (provaFixes.fixes.length > 0) {
            report.provasFixed.push(provaFixes);
          }
        } catch (error: any) {
          report.errors.push({
            provaId: prova._id,
            provaNome: prova.nome,
            error: error.message,
          });
        }
      }

      report.status = 'completed';
    } catch (error: any) {
      report.status = 'error';
      report.errors.push({
        provaId: '',
        provaNome: '',
        error: `Erro geral: ${error.message}`,
      });
    } finally {
      report.processedAt = new Date().toISOString();
      this.syncReport = report;
      this.isSyncing = false;
    }
  }

  /**
   * Determina quais questoes da prova devem pertencer a um simulado
   * baseado no nome do simulado e nas propriedades da questao (enemArea, frente1).
   * Replica a logica das factories selectSimuladosToEnter.
   */
  private selectQuestionsForSimulado(
    simulado: Simulado,
    questoesDaProva: Questao[],
    prova: Prova,
    frenteIngles: Frente,
    frenteEspanhol: Frente,
  ): Questao[] {
    const nome = simulado.nome;
    const tipoNomeAno = prova.tipo ? `${prova.tipo.nome} ${prova.ano}` : '';

    return questoesDaProva.filter((q) => {
      const frente1Id = q.frente1?._id?.toString() || '';
      const isIngles = frente1Id === frenteIngles?._id?.toString();
      const isEspanhol = frente1Id === frenteEspanhol?._id?.toString();

      // Simulado padrao (ex: "Enem Dia 2 2023"): todas as questoes da prova
      if (nome === tipoNomeAno) return true;

      // Simulado completo Ingles (ex: "Enem Dia 1 2023 Inglês"):
      // Todas menos as de Espanhol
      if (nome === `${tipoNomeAno} Inglês`) {
        return !isEspanhol;
      }

      // Simulado completo Espanhol: todas menos as de Ingles
      if (nome === `${tipoNomeAno} Espanhol`) {
        return !isIngles;
      }

      // Simulado de area com idioma (ex: "... Linguagens Inglês")
      if (nome.includes(q.enemArea)) {
        if (nome.includes('Inglês')) {
          // Questoes da area que sao Ingles OU que nao sao de idioma especifico
          return isIngles || (!isIngles && !isEspanhol);
        }
        if (nome.includes('Espanhol')) {
          return isEspanhol || (!isIngles && !isEspanhol);
        }
        // Simulado de area sem idioma (ex: "... Ciências Humanas")
        return true;
      }

      return false;
    });
  }

  async getSummary() {
    const provaTotal = await this.repository.getTotalEntity();
    return {
      provaTotal,
    };
  }
}
