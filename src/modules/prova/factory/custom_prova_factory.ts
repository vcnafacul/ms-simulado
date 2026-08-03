import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { CreateQuestaoDTOInput } from 'src/modules/questao/dtos/create.dto.input';
import { UpdateDTOInput } from 'src/modules/questao/dtos/update.dto.input';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { Questao } from 'src/modules/questao/questao.schema';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { SimuladoService } from 'src/modules/simulado/simulado.service';
import { Categoria } from 'src/modules/categoria/schemas/categoria.schema';
import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { updateNumeroNoContainer } from '../helpers/question-container.helpers';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';
import { IProvaFactory } from './types';

/**
 * Factory de provas personalizadas (categoria `custom: true`).
 *
 * Diferenças vs. factories ENEM:
 * - Nome livre (vem do DTO), unicidade validada por criador.
 * - Gera exatamente 1 simulado por prova (sem áreas / idiomáticas).
 * - Sem `FrenteRepository`/`EnemService` — não há regras de Inglês/Espanhol.
 *
 * A `categoria` já vem resolvida (injetada pelo dispatcher no Card 03), por isso
 * não injetamos `CategoriaRepository`.
 */
export class CustomProvaFactory implements IProvaFactory {
  // Guardado em createProva para uso em createSimulados (mesma instância por
  // request: o dispatcher cria uma factory nova a cada getFactory).
  private provaItem: CreateProvaDTOInput | null = null;

  constructor(
    private readonly questaoRepository: QuestaoRepository,
    private readonly provaRepository: ProvaRepository,
    private readonly simuladoService: SimuladoService,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly categoria: Categoria,
  ) {}

  async createProva(item: CreateProvaDTOInput): Promise<Prova> {
    if (!item.nome || !item.nome.trim()) {
      throw new BadRequestException('Nome da prova é obrigatório');
    }

    const jaExiste = await this.provaRepository.getByFilter({
      nome: item.nome,
      criadorId: item.criadorId,
    });
    if (jaExiste) {
      throw new HttpException(
        'Você já tem uma prova com esse nome',
        HttpStatus.CONFLICT,
      );
    }

    this.provaItem = item;

    // O constructor de Prova já seta criadorId (a partir do item), cursinhoId
    // (null), filename e gabarito.
    const prova = new Prova(item, this.categoria);
    prova.nome = item.nome;
    prova.totalQuestao = this.categoria.quantidadeTotalQuestao;
    prova.enemAreas = [];
    return prova;
  }

  public async createSimulados(prova: Prova): Promise<void> {
    const nomeSimulado = this.provaItem?.nomeSimulado;
    if (!nomeSimulado || !nomeSimulado.trim()) {
      throw new BadRequestException('Nome do simulado é obrigatório');
    }

    const simulado = await this.simuladoRepository.create({
      nome: nomeSimulado,
      descricao: `${prova.categoria.exame.nome}`,
      categoria: prova.categoria,
      questoes: [],
      criadorId: prova.criadorId,
      cursinhoId: prova.cursinhoId,
    } as any);

    prova.simulados.push(simulado);
  }

  public async createQuestion(
    question: CreateQuestaoDTOInput,
  ): Promise<Questao> {
    const questao = Object.assign(new Questao(), question);
    const provaToEnter = await this.provaRepository.getById(question.prova);

    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      const result = await this.questaoRepository.create(questao);
      await this.simuladoService.addQuestionSimulados(
        provaToEnter.simulados,
        result,
        session,
      );
      await this.provaRepository.addQuestion(question.prova, result);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async updateQuestion(question: UpdateDTOInput): Promise<void> {
    const questao = await this.questaoRepository.getByIdToUpdate(question._id);
    const provaToLeaveId = questao.prova?._id.toString();
    const provaToEnter = await this.provaRepository.getById(question.prova);
    const changeProva = provaToLeaveId !== provaToEnter._id.toString();

    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      if (changeProva && provaToLeaveId) {
        const oldProva = await this.provaRepository.getById(provaToLeaveId);
        await this.simuladoService.removeQuestionSimulados(
          oldProva.simulados,
          questao,
          session,
        );
        await this.provaRepository.removeQuestion(provaToLeaveId, questao);
        await this.simuladoService.addQuestionSimulados(
          provaToEnter.simulados,
          questao,
          session,
        );
        await this.provaRepository.addQuestion(question.prova, questao);
      }
      await this.questaoRepository.updateQuestion(question);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    // Numero-sync (cutover): numero vive no subdoc; se mudou, reconcilia in-place
    // na prova de destino e seus simulados que referenciam a questão.
    if (question.numero != null && question.numero !== questao.numero) {
      const provaAtual = await this.provaRepository.getById(question.prova);
      if (updateNumeroNoContainer(provaAtual, question._id, question.numero)) {
        await this.provaRepository.update(provaAtual);
      }
      await Promise.all(
        provaAtual.simulados.map(async (sml) => {
          if (updateNumeroNoContainer(sml, question._id, question.numero)) {
            await this.simuladoRepository.update(sml);
          }
        }),
      );
    }
  }

  public async verifyNumberProva(
    id: string,
    numberQuestion: number,
  ): Promise<boolean> {
    const prova = await this.provaRepository.getProvaWithQuestion(id);
    return !prova.questoes.some((qc) => qc.numero === numberQuestion);
  }

  public async getMissingNumbers(prova: Prova): Promise<number[]> {
    if (prova.categoria.quantidadeTotalQuestao == null) {
      return [];
    }

    const missingQuestion: number[] = [];
    for (let i = 1; i <= prova.categoria.quantidadeTotalQuestao; i++) {
      if (!prova.questoes.find((qc) => qc.numero === i)) {
        missingQuestion.push(i);
      }
    }
    return missingQuestion;
  }
}
