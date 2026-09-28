import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Ator } from 'src/shared/ator/ator';
import { AuditLogService } from '../auditLog/auditLog.service';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
import { ProvaFactory } from './factory/prova_factory';
import { ProvaRepository } from './prova.repository';
import { Prova } from './prova.schema';
import { UpdateProvaFilesDTO } from './dtos/update-files.dto.input';
import { revalidarBloqueado } from '../simulado/helpers/bloqueado';
import { syncNumeroNaProvaESimulados } from './helpers/question-container.helpers';
import {
  motivoParaNaoComporProva,
  ResumoDoDono,
  resumoDoDono,
} from './helpers/pode-compor-prova';

@Injectable()
export class ProvaService {
  constructor(
    private readonly provaFactory: ProvaFactory,
    private readonly repository: ProvaRepository,
    private readonly categoriaRepository: CategoriaRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * ⚠️ Antes de qualquer escrita na composição da prova (tickets/023, card
   * 03). 404 se a prova não existe; 403 com o motivo se o ator não pode.
   */
  public async assertPodeComporProva(provaId: string, ator?: Ator) {
    const prova = await this.repository.getDonoDaProva(provaId);
    if (!prova) {
      throw new NotFoundException(`Prova com ID ${provaId} não encontrada.`);
    }
    const motivo = motivoParaNaoComporProva(prova, ator);
    if (motivo) throw new ForbiddenException(motivo);
  }

  /**
   * Liga/desliga o "aplicar novas versões automaticamente" (tickets/023, card
   * 05). Só o dono da prova (R2).
   *
   * ⚠️ `$set` do campo, nunca o `repository.update(prova)`: `approvedQuestion`,
   * `refuseQuestion` e `updateFiles` regravam o documento inteiro, e um deles
   * rodando junto desfaria a troca — ou esta desfaria a deles.
   */
  public async alterarReceberNovasVersoes(
    id: string,
    valor: boolean,
    ator?: Ator,
  ): Promise<{ receberNovasVersoes: boolean }> {
    await this.assertPodeComporProva(id, ator);
    const de = await this.repository.setReceberNovasVersoes(id, valor);
    await this.auditLogService?.create({
      user: ator!.userId,
      entityId: id,
      entityType: 'Prova',
      changes: JSON.stringify({
        acao: 'receberNovasVersoes',
        de,
        para: valor,
        cursinhoId: ator!.cursinhoId,
      }),
    });
    return { receberNovasVersoes: valor };
  }

  public async create(item: CreateProvaDTOInput): Promise<GetProvaDTOOutout> {
    /*
      ⚠️ Antes de tudo: a fábrica cria os simulados antes da prova e sem
      transação, então qualquer recusa depois disso deixaria lixo.
    */
    const categoria = await this.categoriaRepository.getVivaById(
      item.categoria,
    );
    if (!categoria) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    // tickets/023, card 04 (R3): cursinho só cria prova em categoria dele.
    // Senão criaria uma prova protegida que nem ele compõe (R2).
    if (item.cursinhoId && categoria.dono !== item.cursinhoId) {
      throw new ForbiddenException(
        'Use uma categoria do seu cursinho para criar a prova.',
      );
    }
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
        totalQuestaoCadastradas: result.questoes.length,
        totalQuestaoValidadas: result.totalQuestaoValidadas,
        filename: result.filename,
        gabarito: result.gabarito,
        enemAreas: result.enemAreas,
        createdAt: result.createdAt,
        receberNovasVersoes: result.receberNovasVersoes,
      } as GetProvaDTOOutout;
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.CONFLICT);
    }
  }

  public async getById(id: string): Promise<Prova> {
    const prova = await this.repository.getById(id);
    return prova;
  }

  /**
   * A prova para a tela, com dono, proteção e se o ator pode compor
   * (tickets/023, card 07). Ler é livre (R1): quem barra escrita é o assert.
   */
  public async getByIdComDono(
    id: string,
    ator?: Ator,
  ): Promise<(Prova & ResumoDoDono) | null> {
    const prova = await this.repository.getById(id);
    if (!prova) return null;
    return {
      ...((prova as any).toObject ? (prova as any).toObject() : prova),
      ...resumoDoDono(prova, ator),
    };
  }

  public async syncNumero(
    provaId: string,
    questaoId: string,
    numero: number | null,
  ): Promise<void> {
    await syncNumeroNaProvaESimulados(
      this.repository,
      this.simuladoRepository,
      provaId,
      questaoId,
      numero,
    );
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
      totalQuestaoCadastradas: prova.questoes.length,
      createdAt: prova.createdAt,
      receberNovasVersoes: prova.receberNovasVersoes,
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
    prova.totalQuestaoValidadas = prova.questoes.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return true;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.find(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // A aprovação ainda não foi persistida: entra no cálculo como em trânsito.
        revalidarBloqueado(simulado, { questaoId: questionId, aprovada: true });
        await this.simuladoRepository.update(simulado);
      }),
    );
    await this.repository.update(prova);
  }

  public async refuseQuestion(id: string, questionId: string) {
    const prova = await this.repository.getById(id);

    // Recalcula totalQuestaoValidadas excluindo a questão sendo rejeitada
    prova.totalQuestaoValidadas = prova.questoes.filter((qc) => {
      if (qc.questao._id.toString() === questionId) return false;
      return qc.questao.status === Status.Approved;
    }).length;

    await Promise.all(
      prova.simulados.map(async (simulado) => {
        const containsQuestion = simulado.questoes.some(
          (qc) => qc.questao._id.toString() === questionId,
        );
        if (!containsQuestion) return;

        // A rejeição ainda não foi persistida: entra no cálculo como em trânsito.
        revalidarBloqueado(simulado, {
          questaoId: questionId,
          aprovada: false,
        });
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
      totalQuestaoCadastradas: prova.questoes.length,
      totalQuestaoValidadas: prova.totalQuestaoValidadas,
      filename: prova.filename,
      gabarito: prova.gabarito,
      enemAreas: prova.enemAreas,
      createdAt: prova.createdAt,
      receberNovasVersoes: prova.receberNovasVersoes,
    } as GetProvaDTOOutout;
  }
}
