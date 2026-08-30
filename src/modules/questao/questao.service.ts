import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { AuditLog } from '../auditLog/auditLog.schema';
import { AuditLogService } from '../auditLog/auditLog.service';
import { ExameRepository } from '../exame/exame.repository';
import { FrenteRepository } from '../frente/frente.repository';
import { MateriaRepository } from '../materia/materia.repository';
import { ProvaFactory } from '../prova/factory/prova_factory';
import { ProvaRepository } from '../prova/prova.repository';
import { ProvaService } from '../prova/prova.service';
import { SimuladoService } from '../simulado/simulado.service';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { QuestaoAllDTO } from './dtos/questao.all.dto.output';
import { QuestaoDTOInput } from './dtos/questao.dto.input';
import { UpdateClassificacaoDTOInput } from './dtos/update-classificacao.dto.input';
import { UpdateContentDTOInput } from './dtos/update-content.dto.input';
import { UpdateImageAlternativaDTOInput } from './dtos/update-image-alternativa.dto.input';
import { UpdateImageIdDTOInput } from './dtos/update-image-id.dto.input';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { ProvaContendo, QuestaoRepository } from './questao.repository';
import { Questao } from './questao.schema';

@Injectable()
export class QuestaoService {
  private readonly logger = new Logger(QuestaoService.name);

  constructor(
    private readonly repository: QuestaoRepository,
    private readonly provaService: ProvaService,
    private readonly provaRepository: ProvaRepository,
    private readonly exameRepository: ExameRepository,
    private readonly materiaRepository: MateriaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly auditLogService: AuditLogService,
    private readonly simuladoService: SimuladoService,
    private readonly provaFactory: ProvaFactory,
  ) {}

  public async create(item: CreateQuestaoDTOInput): Promise<Questao> {
    const prova = await this.provaRepository.getById(item.prova);
    const factory = this.provaFactory.getFactory(prova.categoria, prova.ano);
    if (
      item.numero == null ||
      (await factory.verifyNumberProva(prova._id, item.numero))
    ) {
      return await factory.createQuestion(item);
    }
    throw new HttpException(
      `Possível questão já cadastrada com número ${item.numero}.`,
      HttpStatus.CONFLICT,
    );
  }

  public async getById(
    id: string,
  ): Promise<(Questao & { provasContendo: ProvaContendo[] }) | null> {
    const questao = await this.repository.getById(id);
    if (!questao) return null;
    const map = await this.repository.findProvasContendoMany([id]);
    const obj = (
      (questao as any).toObject ? (questao as any).toObject() : questao
    ) as Questao & { provasContendo: ProvaContendo[] };
    obj.provasContendo = map.get(id.toString()) ?? [];
    return obj;
  }

  public async canInsertQuestion(
    provaId: string,
    numero: number,
    frente1: string,
  ): Promise<boolean> {
    return this.repository.canInsertQuestion(provaId, numero, frente1);
  }

  public async getAll({
    page,
    limit,
    text,
    status,
    materia,
    frente,
    prova,
    enemArea,
    sortColumn = 'updatedAt',
    sortOrder = 'desc',
  }: QuestaoDTOInput): Promise<GetAllOutput<QuestaoAllDTO>> {
    const textConditions: any[] = text
      ? this.generateTextCombinations(text)
      : [];
    const frenteorConditions: any[] = frente
      ? this.generateFrentesCombinations(frente)
      : [];

    const combineConditions: any[] = [];
    if (frenteorConditions.length > 0)
      combineConditions.push(frenteorConditions);
    if (textConditions.length > 0) combineConditions.push(textConditions);

    const where: Record<string, string | number | { $in: string[] }> = {};
    if (status !== undefined) where['status'] = status;
    if (materia) where['materia'] = materia;
    if (prova) {
      where['_id'] = {
        $in: await this.repository.findQuestaoIdsByProva(prova),
      };
    }
    if (enemArea) where['enemArea'] = enemArea;

    const questoes = await this.repository.getAll({
      page,
      limit,
      where,
      or: combineConditions,
      sortColumn,
      sortOrder,
    });

    const ids = questoes.data.map((q) => q._id.toString());
    const provasMap = await this.repository.findProvasContendoMany(ids);
    const questoesAll: QuestaoAllDTO[] = questoes.data.map((questao) => ({
      _id: questao._id,
      provasContendo: provasMap.get(questao._id.toString()) ?? [],
      provaBase: questao.provaBase ? questao.provaBase.toString() : null,
      enemArea: questao.enemArea,
      materia: questao.materia?.nome,
      status: questao.status,
      updatedAt: questao.updatedAt,
    }));

    return {
      data: questoesAll,
      page: questoes.page,
      limit: questoes.limit,
      totalItems: questoes.totalItems,
    };
  }

  public async delete(id: string): Promise<void> {
    const question = await this.repository.getByIdToDelete(id);
    if (!question) {
      throw new NotFoundException(`Registro com ID ${id} não encontrado.`);
    }
    if (question.status === Status.Approved) {
      throw new BadRequestException(
        'Não é permitido excluir questões já aprovadas',
      );
    }
    const session = await this.repository.startSession();
    session.startTransaction();
    try {
      const provas = await this.repository.findProvasContendo(id);
      for (const prova of provas) {
        await this.simuladoService.removeQuestionSimulados(
          prova.simulados,
          question,
          session,
        );
        await this.provaRepository.removeQuestion(prova._id, question);
      }
      await this.repository.delete(id);
      await session.commitTransaction();
      session.endSession();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  public async getInfos() {
    const param: GetAllInput = {
      page: 1,
      limit: 0,
    };
    const provas = await this.provaRepository.getAll(param);
    const exames = await this.exameRepository.getAll(param);
    const materias = await this.materiaRepository.getAll(param);
    const frentes = await this.frenteRepository.getAll(param);
    return {
      provas: provas.data,
      exames: exames.data,
      materias: materias.data,
      frentes: frentes.data,
    };
  }

  public async updateStatus(
    id: string,
    status: Status,
    userId: string,
    message?: string,
  ) {
    try {
      const question = await this.repository.getByIdToUpdate(id);
      if (question.status === status) {
        throw new HttpException(
          'Não houve alteração de status',
          HttpStatus.NOT_MODIFIED,
        );
      }
      const provas = await this.repository.findProvasContendo(id);
      if (provas.length === 0) {
        throw new HttpException(
          'Para aprovar ou rejeitar, a questão precisa estar em ao menos uma prova',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (status === Status.Approved) {
        for (const prova of provas) {
          await this.provaService.approvedQuestion(prova._id, id);
        }
      } else if (question.status === Status.Approved) {
        for (const prova of provas) {
          await this.provaService.refuseQuestion(prova._id, id);
        }
      }
      await this.repository.UpdateStatus(id, status);
      await this.auditLogService.create({
        user: userId,
        entityId: question?._id,
        entityType: 'Questao',
        changes: JSON.stringify({
          status,
          message,
        }),
      });
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar a questão.  ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  public async updateQuestion(question: UpdateDTOInput) {
    if (!question.prova) {
      throw new HttpException('Prova não informada', HttpStatus.BAD_REQUEST);
    }
    const prova = await this.provaRepository.getById(question.prova);
    const factory = this.provaFactory.getFactory(prova.categoria, prova.ano);
    try {
      await factory.updateQuestion(question);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async removerDeProva(
    questaoId: string,
    provaId: string,
    userId?: string,
  ): Promise<void> {
    const provas = await this.repository.findProvasContendo(questaoId);
    if (provas.length <= 1) {
      throw new BadRequestException(
        'Não é possível remover o último vínculo. Para retirar de todas as provas, exclua a questão.',
      );
    }
    const alvo = provas.find((p) => p._id.toString() === provaId);
    if (!alvo) {
      throw new BadRequestException('A questão não está nesta prova.');
    }
    const questao = await this.repository.getByIdToUpdate(questaoId);

    const session = await this.repository.startSession();
    session.startTransaction();
    try {
      await this.simuladoService.removeQuestionSimulados(
        alvo.simulados,
        questao,
        session,
      );
      await this.provaRepository.removeQuestion(provaId, questao, session);
      if (questao.provaBase?.toString() === provaId) {
        await this.repository.setProvaBase(questaoId, null, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    await this.auditLogService.create({
      user: userId,
      entityId: questaoId,
      entityType: 'Questao',
      changes: JSON.stringify({ acao: 'removerDeProva', provaId }),
    });
  }

  public async definirProvaBase(
    questaoId: string,
    provaId: string,
    userId?: string,
  ): Promise<void> {
    const naProva = await this.repository.provaContemQuestao(
      provaId,
      questaoId,
    );
    if (!naProva) {
      throw new BadRequestException(
        'A prova indicada não contém esta questão.',
      );
    }
    await this.repository.setProvaBase(questaoId, provaId);
    await this.auditLogService.create({
      user: userId,
      entityId: questaoId,
      entityType: 'Questao',
      changes: JSON.stringify({ acao: 'definirProvaBase', provaId }),
    });
  }

  public async adicionarEmProva(
    questaoId: string,
    provaId: string,
    numero: number,
    userId?: string,
  ): Promise<void> {
    const prova = await this.provaRepository.getById(provaId);
    if (!prova) {
      throw new NotFoundException(`Prova com ID ${provaId} não encontrada.`);
    }
    const jaVinculada = await this.repository.provaContemQuestao(
      provaId,
      questaoId,
    );
    if (jaVinculada) {
      throw new BadRequestException('A questão já está nesta prova.');
    }
    const factory = this.provaFactory.getFactory(prova.categoria, prova.ano);
    const numeroLivre = await factory.verifyNumberProva(prova._id, numero);
    if (!numeroLivre) {
      throw new BadRequestException(
        `Número ${numero} indisponível nesta prova.`,
      );
    }
    await factory.addQuestaoExistenteAProva(questaoId, provaId, numero);
    await this.auditLogService.create({
      user: userId,
      entityId: questaoId,
      entityType: 'Questao',
      changes: JSON.stringify({ acao: 'adicionarEmProva', provaId, numero }),
    });
  }

  public async updateClassificacao(
    id: string,
    classificacao: UpdateClassificacaoDTOInput,
  ) {
    const questao = await this.repository.getByIdToUpdate(id);
    if (!questao) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    const enemAreaChanged = classificacao.enemArea !== questao.enemArea;
    const frente1Changed =
      classificacao.frente1 !== questao.frente1?._id?.toString();

    try {
      // enemArea/frente1 podem mudar a membership de simulado (idiomáticas ENEM)
      // → precisa da factory. A factory já sincroniza o numero no fim.
      if (enemAreaChanged || frente1Changed) {
        const updateDto = new UpdateDTOInput();
        updateDto._id = id;
        updateDto.prova = classificacao.prova;
        updateDto.enemArea = classificacao.enemArea;
        updateDto.frente1 = classificacao.frente1;
        updateDto.frente2 = classificacao.frente2;
        updateDto.frente3 = classificacao.frente3;
        updateDto.materia = classificacao.materia;
        updateDto.numero = classificacao.numero;
        updateDto.alternativa = questao.alternativa;
        await this.updateQuestion(updateDto);
      } else if (classificacao.numero !== undefined) {
        // `null` explícito = "remover número" (questão segue na prova, sem
        // posição) e precisa sincronizar igual a um número novo. Só campo
        // ausente (`undefined`) é que significa "não mexer no numero".
        //
        // Hoje o client sempre manda `numero` no payload (o valor atual do
        // vínculo, mudado ou não), então o guard nunca dispara. Ele existe
        // porque o DTO marca o campo `@IsOptional()`: sem ele, um payload sem
        // `numero` sincronizaria `undefined` e apagaria a posição em silêncio.
        //
        // Guard: no branch numero-only assumimos que a questão já está na prova
        // enviada (a UI trava a prova). Falha alto se não estiver, em vez de o
        // syncNumero virar no-op silencioso na prova errada.
        const naProva = await this.repository.provaContemQuestao(
          classificacao.prova,
          id,
        );
        if (!naProva) {
          throw new HttpException(
            `A questão ${id} não está na prova ${classificacao.prova}.`,
            HttpStatus.BAD_REQUEST,
          );
        }
        // Só o numero mudou (ou ficou igual): sync escopado na prova editada
        // + simulados dela. syncNumero é idempotente (no-op se já correto).
        // `?? null`: o DTO declara `numero?: number | null` (campo opcional
        // pra Swagger), mas sem o `!= null` que existia antes, o TypeScript
        // não estreita mais pra `number` — normaliza `undefined` pra `null`
        // porque syncNumero espera exatamente `number | null`.
        await this.provaService.syncNumero(
          classificacao.prova,
          id,
          classificacao.numero ?? null,
        );
      }
      await this.repository.updateClassificacao(id, classificacao);
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar a classificação. ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  public async updateContent(id: string, content: UpdateContentDTOInput) {
    const questao = await this.repository.getById(id);
    if (!questao) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    try {
      await this.repository.updateContent(id, content);

      // Extract asset:// references from all text fields and update assets array
      if (content.contentFormat === 'markdown') {
        const allText = [
          content.textoQuestao,
          content.pergunta,
          content.textoAlternativaA,
          content.textoAlternativaB,
          content.textoAlternativaC,
          content.textoAlternativaD,
          content.textoAlternativaE,
        ]
          .filter(Boolean)
          .join('\n');

        const assetRegex = /asset:\/\/([^\s)]+)/g;
        const assets: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = assetRegex.exec(allText)) !== null) {
          assets.push(match[1]);
        }

        await this.repository.updateAssets(id, assets);
      }
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar o conteúdo. ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  public async updateImageId(id: string, imageId: UpdateImageIdDTOInput) {
    const questao = await this.repository.getById(id);
    if (!questao) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    try {
      await this.repository.updateImageId(id, imageId);
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar o imageId. ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  public async updateImageAlternativa(
    id: string,
    imageAlternativa: UpdateImageAlternativaDTOInput,
  ) {
    const questao = await this.repository.getById(id);
    if (!questao) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    try {
      await this.repository.updateImageAlternativa(id, imageAlternativa);
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar a imagem da alternativa. ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
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

  private generateFrentesCombinations(text: string) {
    const combinations = [];
    if (text) {
      combinations.push({ frente1: text });
      combinations.push({ frente2: text });
      combinations.push({ frente3: text });
    }

    return combinations;
  }

  private generateTextCombinations(text: string) {
    const combinations = [];

    combinations.push({ textoQuestao: { $regex: text, $options: 'i' } });
    combinations.push({
      textoAlternativaA: { $regex: text, $options: 'i' },
    });
    combinations.push({
      textoAlternativaB: { $regex: text, $options: 'i' },
    });
    combinations.push({
      textoAlternativaC: { $regex: text, $options: 'i' },
    });
    combinations.push({
      textoAlternativaD: { $regex: text, $options: 'i' },
    });
    combinations.push({
      textoAlternativaE: { $regex: text, $options: 'i' },
    });

    return combinations;
  }

  async getSummary() {
    const questionTotal = await this.repository.getTotalEntity();
    const questionPending = await this.repository.entityByStatus(
      Status.Pending,
    );
    const questionApproved = await this.repository.entityByStatus(
      Status.Approved,
    );
    const questionRejected = await this.repository.entityByStatus(
      Status.Rejected,
    );

    const questionReported = await this.repository.getTotalEntityReported();

    const questionClassified = await this.repository.getTotalEntityClassified();

    return {
      questionTotal,
      questionPending,
      questionApproved,
      questionRejected,
      questionReported,
      questionClassified,
    };
  }

  async getPendingByMateria(materiaIds?: string[]) {
    const byMateria = await this.repository.pendingByMateria(materiaIds);
    const total = byMateria.reduce((sum, item) => sum + item.count, 0);
    return { total, byMateria };
  }

  public async getLogs(id: string): Promise<AuditLog[]> {
    const questao = await this.repository.getById(id);
    if (!questao) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    return await this.auditLogService.getByEntityId(id);
  }
}
