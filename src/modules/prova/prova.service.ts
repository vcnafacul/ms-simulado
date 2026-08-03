import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { CategoriaRepository } from '../categoria/categoria.repository';
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
import { UpdateProvaFilesDTO } from './dtos/update-files.dto.input';
import { atingiuQuantidade } from '../simulado/helpers/bloqueado';

@Injectable()
export class ProvaService {
  private syncReport: SyncReport | null = null;
  private isSyncing = false;

  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly categoriaRepository: CategoriaRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly frenteRepository: FrenteRepository,
  ) {}

  public async create(item: CreateProvaDTOInput): Promise<GetProvaDTOOutout> {
    const categoria = await this.categoriaRepository.getById(item.categoria);
    const factory = this.provaFactory.getFactory(categoria, item.ano);
    try {
      const prova = await factory.createProva(item);
      await factory.createSimulados(prova);

      const result = await this.repository.create(prova);
      return {
        _id: result._id,
        edicao: result.edicao,
        aplicacao: result.aplicacao,
        ano: result.ano,
        categoria: result.categoria.nome,
        exame: result.categoria.exame.nome,
        nome: result.nome,
        totalQuestao: result.totalQuestao,
        totalQuestaoCadastradas: result.questoesNovo.length,
        totalQuestaoValidadas: result.totalQuestaoValidadas,
        filename: result.filename,
        gabarito: result.gabarito,
        enemAreas: result.enemAreas,
        createdAt: result.createdAt,
      } as GetProvaDTOOutout;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  private toProvaDTO(prova: Prova): GetProvaDTOOutout {
    return {
      _id: prova._id,
      edicao: prova.edicao,
      aplicacao: prova.aplicacao,
      ano: prova.ano,
      categoria: prova.categoria.nome,
      exame: prova.categoria.exame.nome,
      nome: prova.nome,
      totalQuestao: prova.totalQuestao,
      gabarito: prova.gabarito,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      enemAreas: prova.enemAreas,
      totalQuestaoCadastradas: prova.questoesNovo.length,
      createdAt: prova.createdAt,
    } as GetProvaDTOOutout;
  }

  public async getAll(
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll(param);
    return {
      ...provas,
      data: provas.data.map((prova) => this.toProvaDTO(prova)),
    };
  }

  public async getAllByCursinho(
    cursinhoId: string,
    param: GetAllInput,
  ): Promise<GetAllOutput<GetProvaDTOOutout>> {
    const provas = await this.repository.getAll({
      ...param,
      where: { cursinhoId },
    });
    return {
      ...provas,
      data: provas.data.map((prova) => this.toProvaDTO(prova)),
    };
  }

  public async approvedQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas contando a questão sendo aprovada
    prova.totalQuestaoValidadas = prova.questoesNovo.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return true;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoesNovo.find(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        const hasRequiredCount = atingiuQuantidade(
          simulado.categoria.quantidadeTotalQuestao,
          simulado.questoesNovo.length,
        );
        const allApproved = simulado.questoesNovo.every(
          (qc) =>
            qc.questao.status === Status.Approved ||
            qc.questao._id.toString() === questionId,
        );

        simulado.bloqueado = !(hasRequiredCount && allApproved);
        if (!simulado.bloqueado) {
          simulado.questoesNovo = simulado.questoesNovo.sort(
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
    prova.totalQuestaoValidadas = prova.questoesNovo.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return false;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoesNovo.some(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // Recalcula bloqueado considerando a questão sendo rejeitada
        const hasRequiredCount = atingiuQuantidade(
          simulado.categoria.quantidadeTotalQuestao,
          simulado.questoesNovo.length,
        );
        const allApproved =
          hasRequiredCount &&
          simulado.questoesNovo.every((qc) => {
            if (qc.questao._id.toString() === questionId) return false;
            return qc.questao.status === Status.Approved;
          });

        simulado.bloqueado = !allApproved;
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async getMissingNumbers(id: string) {
    const prova = await this.repository.getProvaWithQuestion(id);
    const factory = this.provaFactory.getFactory(prova.categoria, prova.ano);
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
          const oldQuestaoIds = (prova.questoesNovo || [])
            .filter((qc) => qc != null && qc.questao != null)
            .map((qc) => ((qc.questao as any)._id ?? qc.questao).toString())
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
          questoesDaProva.sort((a, b) => a.numero - b.numero);
          prova.questoesNovo = questoesDaProva.map((q) => ({
            questao: q._id,
            numero: q.numero,
          })) as any;

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
            const oldSimQuestaoIds = (simulado.questoesNovo || [])
              .filter((qc) => qc != null && qc.questao != null)
              .map((qc) => ((qc.questao as any)._id ?? qc.questao).toString())
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
            const hasRequiredCount = simulado.categoria
              ? atingiuQuantidade(
                  simulado.categoria.quantidadeTotalQuestao,
                  newSimQuestoes.length,
                )
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
                detail: !simulado.categoria
                  ? 'categoria e nula, definido bloqueado=true'
                  : `questoes: ${newSimQuestoes.length}/${simulado.categoria.quantidadeTotalQuestao}, todasAprovadas: ${allApproved}`,
              });
            }

            // C3: Atualizar simulado com questoes reconstruidas e ordenadas
            newSimQuestoes.sort((a, b) => a.numero - b.numero);
            simulado.questoesNovo = newSimQuestoes.map((q) => ({
              questao: q._id,
              numero: q.numero,
            })) as any;
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
    // Prova custom: nome do simulado é livre, então não há string matching —
    // todas as questões da prova entram no único simulado.
    if (prova.categoria?.custom) {
      return [...questoesDaProva];
    }

    const nome = simulado.nome;
    const tipoNomeAno = prova.categoria
      ? `${prova.categoria.nome} ${prova.ano}`
      : '';

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

  public async updateFiles(
    id: string,
    dto: UpdateProvaFilesDTO,
  ): Promise<GetProvaDTOOutout> {
    const prova = await this.repository.getById(id);

    if (!prova) {
      throw new HttpException('Prova não encontrada', HttpStatus.NOT_FOUND);
    }
    if (!dto.filename && !dto.gabarito) {
      throw new HttpException(
        'Nenhum campo para atualizar',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.filename) {
      prova.filename = dto.filename;
    }

    if (dto.gabarito) {
      prova.gabarito = dto.gabarito;
    }

    await this.repository.update(prova);

    return {
      _id: prova._id,
      edicao: prova.edicao,
      aplicacao: prova.aplicacao,
      ano: prova.ano,
      categoria: prova.categoria.nome,
      exame: prova.categoria.exame.nome,
      nome: prova.nome,
      totalQuestao: prova.totalQuestao,
      totalQuestaoCadastradas: prova.questoesNovo.length,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      gabarito: prova.gabarito,
      enemAreas: prova.enemAreas,
      createdAt: prova.createdAt,
    } as GetProvaDTOOutout;
  }
}
