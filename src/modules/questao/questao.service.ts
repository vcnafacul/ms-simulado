import {
  BadRequestException,
  ConflictException,
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
import { documentoDaCopia } from './duplicarQuestao';
import { provasQueRecusamArea } from '../prova/services/area-da-prova';
import { TipoOrigem } from './enums/tipo-origem.enum';
import {
  cadeiaDeVersoes,
  ItemDaLinhagem,
  LinhagemDaQuestao,
  NoDaLinhagem,
  resumoDoEnunciado,
} from './linhagemDaQuestao';
import {
  MotivoParaNaoExcluir,
  motivosParaNaoExcluir,
  TEXTO_DO_MOTIVO,
} from './exclusaoDaQuestao';

/** Um motivo de recusa como a tela recebe: código para decidir, texto para ler. */
export interface Motivo {
  codigo: MotivoParaNaoExcluir;
  texto: string;
}

const descreverMotivos = (ms: MotivoParaNaoExcluir[]): Motivo[] =>
  ms.map((codigo) => ({ codigo, texto: TEXTO_DO_MOTIVO[codigo] }));
import {
  CAMPOS_DE_CLASSIFICACAO,
  CAMPOS_DE_CONTEUDO,
  camposAlterados,
  registroDaEdicao,
} from './camposAlterados';
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

  /**
   * Se a questão pode ser excluída, e por quê não (card 33).
   *
   * ⚠️ **É a MESMA função que o `delete` usa**, e é por isso que o client pode
   * confiar nela para mostrar o botão — mas não pode confiar no botão: entre
   * esta consulta e o clique, alguém pode pôr a questão numa prova.
   */
  public async podeExcluir(
    id: string,
  ): Promise<{ podeExcluir: boolean; motivos: Motivo[] }> {
    const r = await this.repository.estadoParaExclusao(id);
    if (!r) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }
    const motivos = descreverMotivos(motivosParaNaoExcluir(r.estado));
    return { podeExcluir: motivos.length === 0, motivos };
  }

  /**
   * Exclui uma questão órfã (card 33).
   *
   * ⚠️ **Mudou de comportamento.** Antes, excluir uma questão `Pending` que
   * estivesse em provas a TIRAVA das provas e simulados e fazia `deleteOne`.
   * Agora questão em prova ou simulado **recusa** — tirar de prova é a ação
   * "remover da prova", explícita — e a exclusão é soft.
   *
   * ⚠️ **As condições são todas E**, verificadas aqui no servidor. A recusa é
   * `409` com a lista de motivos, não "não é possível excluir" — que mandaria a
   * pessoa adivinhar.
   */
  public async delete(id: string, userId?: string): Promise<void> {
    const r = await this.repository.estadoParaExclusao(id);
    if (!r) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    const motivos = descreverMotivos(motivosParaNaoExcluir(r.estado));
    if (motivos.length > 0) {
      throw new ConflictException({
        message: 'Esta questão não pode ser excluída.',
        motivos,
      });
    }

    /*
      ⚠️ `false` = a questão mudou entre a checagem e a escrita (foi aprovada
      ou versionada no meio). Recusar em vez de fingir sucesso.
    */
    if (!(await this.repository.excluir(id))) {
      throw new ConflictException({
        message:
          'A questão mudou enquanto era excluída. Recarregue e tente de novo.',
        motivos: [],
      });
    }

    await this.auditLogService.create({
      user: userId,
      entityId: id,
      entityType: 'Questao',
      /*
        ⚠️ **O `origem` removido vai para o log.** Depois do `$unset`, o banco
        não sabe mais de onde a questão excluída veio; aqui fica a auditoria sem
        reviver o vínculo.
      */
      changes: JSON.stringify({
        acao: 'excluir',
        origem: r.origem,
        tipoOrigem: r.tipoOrigem,
      }),
    });
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

    /*
      ⚠️ Card 24 — ANTES de qualquer escrita, pelo mesmo motivo do
      `updateContent`.

      ⚠️ E a questão vem do `getByIdToUpdate`, que popula `frente1`/`materia` —
      por isso a comparação normaliza para string: o documento traz objetos, e o
      payload traz ids.
    */
    const alterados = camposAlterados(
      {
        enemArea: questao.enemArea,
        materia: questao.materia?._id?.toString(),
        frente1: questao.frente1?._id?.toString(),
        frente2: (
          questao as { frente2?: { _id?: unknown } }
        ).frente2?._id?.toString(),
        frente3: (
          questao as { frente3?: { _id?: unknown } }
        ).frente3?._id?.toString(),
      },
      classificacao as unknown as Record<string, unknown>,
      CAMPOS_DE_CLASSIFICACAO,
    );

    const enemAreaChanged = classificacao.enemArea !== questao.enemArea;
    const frente1Changed =
      classificacao.frente1 !== questao.frente1?._id?.toString();

    /*
      ⚠️ **A área nova tem de caber em TODAS as provas da questão**, e não só na
      do vínculo que está sendo editado (card 01 de `area-enem-da-questao`). A
      fábrica recebe só `classificacao.prova`: uma questão na ENEM Dia 1 e numa
      customizada trocaria Linguagens → Matemática editando pelo vínculo da
      customizada, e ficaria errada na do Dia 1.

      ANTES de qualquer escrita, e fora do `try` — que embrulharia a mensagem.
    */
    const provas = await this.repository.findProvasContendo(id);

    /*
      ⚠️ **Questão sem prova tem caminho próprio: só salva** (card 02 de
      `area-enem-da-questao`). Sem prova não há simulado para reposicionar nem
      posição para sincronizar — é o caso da cópia recém-duplicada, que nasce
      sem prova e é a que mais precisa ser reclassificada.

      ⚠️ **Quem decide é o ESTADO da questão, não o corpo.** Decidir pela
      ausência de `prova` no payload deixaria um client antigo, ou um bug,
      mandar sem prova uma questão que ESTÁ em prova — e pular a fábrica.
    */
    const semProva = provas.length === 0;
    if (semProva && classificacao.prova) {
      throw new BadRequestException(
        `A questão ${id} não está em prova nenhuma — não informe a prova.`,
      );
    }
    if (!semProva && !classificacao.prova) {
      throw new BadRequestException(
        'Informe a prova do vínculo editado: esta questão está em prova.',
      );
    }

    if (enemAreaChanged) {
      const recusam = provasQueRecusamArea(provas, classificacao.enemArea);
      if (recusam.length > 0) {
        throw new BadRequestException(
          `Questão de ${classificacao.enemArea} não é permitida ` +
            `${recusam.length === 1 ? 'na prova' : 'nas provas'} ` +
            `${recusam.map((p) => p.nome).join(', ')}, em que esta questão está.`,
        );
      }
    }

    try {
      // enemArea/frente1 podem mudar a membership de simulado (idiomáticas ENEM)
      // → precisa da factory. A factory já sincroniza o numero no fim.
      if (semProva) {
        // Nem fábrica, nem syncNumero: só a escrita abaixo. `numero` ignorado.
      } else if (enemAreaChanged || frente1Changed) {
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

      // ⚠️ Card 24 — ver o docblock no `updateContent`.
      if (alterados.length > 0) {
        await this.auditLogService.create({
          user: classificacao.userId,
          entityId: id,
          entityType: 'Questao',
          changes: registroDaEdicao(
            'updateClassificacao',
            alterados,
            questao.quantidadeResposta,
          ),
        });
      }
    } catch (error: any) {
      throw new HttpException(
        `Não foi possível atualizar a classificação. ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Cria uma cópia editável desta questão, com lastro (card 25).
   *
   * ⚠️ **A original não é tocada** — nem o conteúdo, nem os contadores, nem o
   * vínculo com prova nenhuma. Duplicar é uma ação sobre a NOVA questão.
   *
   * ⚠️ **E a cópia nasce órfã**, sem prova. É o que distingue duplicar de
   * "versionar" (card 26): lá as provas passam a apontar a sucessora; aqui elas
   * não mudam. Quem duplica quer outra questão, não substituir esta.
   */
  public async duplicar(id: string, userId?: string): Promise<Questao> {
    const original = await this.repository.getParaDuplicar(id);
    if (!original) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    const copia = await this.repository.create(
      documentoDaCopia(TipoOrigem.copia, original) as Questao,
    );

    await this.auditLogService.create({
      user: userId,
      /*
        ⚠️ **O log é da ORIGINAL, não da cópia.** Quem vai procurar o rastro
        abre a questão de onde a cópia saiu — e o `getLogs` é por `entityId`.
        Na cópia o lastro já está no campo `origem`.
      */
      entityId: id,
      entityType: 'Questao',
      changes: JSON.stringify({
        acao: 'duplicar',
        copia: String((copia as { _id: unknown })._id),
      }),
    });

    return copia;
  }

  /**
   * A linhagem da questão: a cadeia de versões, as cópias diretas e a origem
   * (card 34A).
   *
   * ⚠️ **Um endpoint, e não dois.** O `listarCopias` do card 25 morreu aqui —
   * dois endpoints para a mesma relação saem de acordo no primeiro que mudar.
   */
  public async linhagem(id: string): Promise<LinhagemDaQuestao> {
    const atual = await this.repository.noDaLinhagem(id);
    if (!atual) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    const [cadeia, copias, origem] = await Promise.all([
      cadeiaDeVersoes(
        atual,
        (x) => this.repository.noDaLinhagem(x),
        (x) => this.repository.sucessoraDe(x),
      ),
      this.repository.copiasDe(id),
      atual.origem && atual.tipoOrigem !== TipoOrigem.versao
        ? this.repository.noDaLinhagem(atual.origem)
        : Promise.resolve(null),
    ]);
    // ⚠️ Sem versões, a cadeia é só a própria questão — e a tela diz "nenhuma".
    const versoes = cadeia.length > 1 ? cadeia : [];

    /*
      ⚠️ **Uma consulta para as provas de TODOS os itens**, e não uma por item.
      O `provasContendo` da Etapa 9 é por questão; aqui a lista pode ter N.
    */
    const todos = [...versoes, ...copias, ...(origem ? [origem] : [])];
    const provas = await this.repository.findProvasContendoMany(
      todos.map((n) => String(n._id)),
    );
    const item = (n: NoDaLinhagem): ItemDaLinhagem => ({
      id: String(n._id),
      status: n.status,
      congelada: !!n.congelada,
      enunciado: resumoDoEnunciado(n.textoQuestao),
      provas: provas.get(String(n._id))?.length ?? 0,
    });

    return {
      atual: id,
      versoes: versoes.map(item),
      copias: copias.map(item),
      origemCopia: origem ? item(origem) : null,
    };
  }

  /**
   * Congela esta questão e cria a sucessora, já editada (card 26).
   *
   * ⚠️ **É o que distingue versionar de duplicar** (card 25): lá a cópia nasce
   * órfã e as provas não mudam; aqui **todas as provas e simulados passam a
   * apontar a sucessora**. Quem versiona diz "o conteúdo mudou de verdade"; a
   * próxima aplicação tem de usar o texto novo, e a anterior tem de continuar
   * vendo o velho.
   *
   * ⚠️ **A ordem importa, e é esta:**
   *
   * 1. cria a sucessora (se falhar, nada aconteceu);
   * 2. escreve o conteúdo novo nela;
   * 3. troca o ponteiro das provas e simulados;
   * 4. congela a original **por último**.
   *
   * Congelar antes de a sucessora existir deixaria a questão inalcançável para
   * edição **e** sem substituta — o pior estado possível, e irreversível pela
   * própria tela.
   *
   * ⚠️ **Sem transação**, e é limitação declarada: o Mongo deste serviço só tem
   * replica set em desenvolvimento (`docker-mongodb-replica.sh`), e as escritas
   * atravessam três coleções. Uma falha entre os passos 3 e 4 deixa a original
   * descongelada com as provas já apontando a sucessora — estado recuperável
   * (basta versionar de novo), ao contrário do inverso.
   */
  public async novaVersao(
    id: string,
    content: UpdateContentDTOInput,
    userId?: string,
  ): Promise<Questao> {
    const original = await this.repository.getParaDuplicar(id);
    if (!original) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }
    if ((original as { congelada?: boolean }).congelada) {
      throw new HttpException(
        `A questão ${id} já está congelada.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const sucessora = await this.repository.create(
      documentoDaCopia(TipoOrigem.versao, original) as Questao,
    );
    const novaId = String((sucessora as { _id: unknown })._id);

    await this.repository.updateContent(novaId, content);
    const trocas = await this.repository.substituirQuestao(id, novaId);
    await this.repository.congelar(id);

    await this.auditLogService.create({
      user: userId,
      // ⚠️ Na ORIGINAL, como o `duplicar` — é onde quem procura o rastro abre.
      entityId: id,
      entityType: 'Questao',
      changes: JSON.stringify({
        acao: 'novaVersao',
        sucessora: novaId,
        provas: trocas.provas,
        simulados: trocas.simulados,
      }),
    });

    return sucessora;
  }

  public async updateContent(id: string, content: UpdateContentDTOInput) {
    const questao = await this.repository.getById(id);
    if (!questao) {
      throw new NotFoundException(`Questão com ID ${id} não encontrada.`);
    }

    /*
      ⚠️ **Questão congelada não aceita edição de conteúdo** (card 26). Ela é o
      que algum histórico aponta, e mudá-la reescreveria o enunciado de uma
      prova já aplicada — que é exatamente o defeito que o card 23 mediu.

      ⚠️ **`BadRequest`, e não um no-op silencioso:** quem chamou acha que
      editou. A tela precisa receber a recusa para oferecer "criar nova versão".
    */
    if (questao.congelada) {
      throw new HttpException(
        `A questão ${id} está congelada: crie uma nova versão para editar.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    /*
      ⚠️ **Calculado ANTES de escrever** (card 24): depois do `updateContent` o
      documento já é o novo, e comparar não diria mais nada.
    */
    const alterados = camposAlterados(
      questao as unknown as Record<string, unknown>,
      content as unknown as Record<string, unknown>,
      CAMPOS_DE_CONTEUDO,
    );

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

      /*
        ⚠️ **Só quando muda de fato** (card 24). Um save que não altera nada não
        é edição, e contá-lo inflaria o número que o card 26 vai usar para
        decidir se o versionamento se paga.

        ⚠️ **Depois da escrita, e DENTRO do try:** log de uma edição que falhou
        seria pior que log nenhum — o card 26 leria como alteração algo que o
        banco recusou.
      */
      if (alterados.length > 0) {
        await this.auditLogService.create({
          user: content.userId,
          entityId: id,
          entityType: 'Questao',
          changes: registroDaEdicao(
            'updateContent',
            alterados,
            questao.quantidadeResposta,
          ),
        });
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
