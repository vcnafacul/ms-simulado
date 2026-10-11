import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotImplementedException,
} from '@nestjs/common';
import { FrenteRepository } from 'src/modules/frente/frente.repository';
import { Frente } from 'src/modules/frente/frente.schema';
import { CreateQuestaoDTOInput } from 'src/modules/questao/dtos/create.dto.input';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { Questao } from 'src/modules/questao/questao.schema';
import { Categoria } from 'src/modules/categoria/schemas/categoria.schema';
import { Idioma } from 'src/modules/simulado/enums/idioma.enum';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { SimuladoService } from 'src/modules/simulado/simulado.service';
import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';
import { validarAreaNaProva } from '../services/area-da-prova';
import { EnemService } from '../services/enem_service';
import {
  ULTIMA_IDIOMATICA,
  numeroLivreEnem,
  numerosFaltantesEnem,
} from './enem-numeracao';
import { IProvaFactory } from './types';

/**
 * Prova ENEM do cursinho (tickets/038, R2/R3) — categorias "Enem Dia 1" e
 * "Enem Dia 2" com `dono = Cursinho`.
 *
 * Diferenças vs. `Enem2017PlusFactory`:
 * - nome **digitado** e único por cursinho, como na `CustomProvaFactory`
 *   (sem ano, edição, aplicação);
 * - só os simulados completos: Dia 1 → "<nome> Inglês" e "<nome> Espanhol";
 *   Dia 2 → "<nome>", numerado 91–180;
 * - o simulado de cada idioma é achado pelo campo `idioma`, nunca pelo nome.
 *
 * Mesmas validações da 2017+: Inglês/Espanhol só (e obrigatoriamente) de 1 a
 * 5, duas questões por número só de 1 a 5, área dentro do dia.
 */
export class EnemCursinhoFactory implements IProvaFactory {
  constructor(
    private readonly questaoRepository: QuestaoRepository,
    private readonly provaRepository: ProvaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly simuladoService: SimuladoService,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly enemService: EnemService,
    private readonly categoria: Categoria,
  ) {}

  /** Dia 1 ou Dia 2 — pelo nome da categoria, que é seed. */
  private get dia1(): boolean {
    if (this.categoria.nome === EnemArea.Enem1) return true;
    if (this.categoria.nome === EnemArea.Enem2) return false;
    throw new BadRequestException(
      `Categoria "${this.categoria.nome}" não é um dia do ENEM.`,
    );
  }

  async createProva(item: CreateProvaDTOInput): Promise<Prova> {
    const nome = item.nome?.trim();
    if (!nome) {
      throw new BadRequestException('Nome da prova é obrigatório');
    }
    const jaExiste = await this.provaRepository.getAtivaByNomeECursinho(
      nome,
      item.cursinhoId ?? null,
    );
    if (jaExiste) {
      throw new HttpException(
        'Já existe uma prova com esse nome',
        HttpStatus.CONFLICT,
      );
    }

    const prova = new Prova(item, this.categoria);
    prova.nome = nome;
    if (this.dia1) {
      prova.enemAreas = [EnemArea.Linguagens, EnemArea.CienciasHumanas];
      prova.inicialNumero = 1;
      // 90 posições + as 5 do segundo idioma.
      prova.totalQuestao = 95;
    } else {
      prova.enemAreas = [EnemArea.BioExatas, EnemArea.Matematica];
      prova.inicialNumero = 91;
      prova.totalQuestao = 90;
    }
    return prova;
  }

  public async createSimulados(prova: Prova): Promise<void> {
    const idiomas: (Idioma | null)[] = this.dia1
      ? [Idioma.Ingles, Idioma.Espanhol]
      : [null];
    for (const idioma of idiomas) {
      prova.simulados.push(
        await this.simuladoRepository.create({
          nome: idioma ? `${prova.nome} ${idioma}` : prova.nome,
          descricao: idioma
            ? `${prova.categoria.exame.nome} ${idioma}`
            : `${prova.categoria.exame.nome}`,
          categoria: prova.categoria,
          questoes: [],
          criadorId: prova.criadorId,
          cursinhoId: prova.cursinhoId,
          idioma,
        } as Simulado),
      );
    }
  }

  public async getMissingNumbers(prova: Prova): Promise<number[]> {
    return numerosFaltantesEnem(prova, this.dia1);
  }

  public async verifyNumberProva(
    id: string,
    numberQuestion: number,
  ): Promise<boolean> {
    const prova = await this.provaRepository.getProvaWithQuestion(id);
    return numeroLivreEnem(prova, numberQuestion);
  }

  public async createQuestion(
    question: CreateQuestaoDTOInput,
  ): Promise<Questao> {
    const [frenteIngles, frenteEspanhol] = await this.frentesDeIdioma();
    await this.enemService.validate(
      question,
      frenteIngles,
      frenteEspanhol,
      1,
      ULTIMA_IDIOMATICA,
    );

    const prova = await this.provaRepository.getById(question.prova);
    // ⚠️ Tudo que recusa vem ANTES de qualquer escrita.
    validarAreaNaProva(prova, question.enemArea);
    const idioma = this.idiomaDaFrente(
      question.frente1,
      frenteIngles,
      frenteEspanhol,
    );
    this.recusarIdiomaRepetido(prova, question.numero, idioma, [
      frenteIngles,
      frenteEspanhol,
    ]);
    const simulados = simuladosDoIdioma(prova, idioma);

    const questao = Object.assign(new Questao(), question);
    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      const result = await this.questaoRepository.create(questao);
      await this.simuladoService.addQuestionSimulados(
        simulados,
        result,
        question.numero,
        session,
      );
      await this.provaRepository.addQuestion(
        question.prova,
        result,
        question.numero,
        session,
      );
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Card 03 da série: editar e vincular seguem o mesmo roteamento por idioma.
  public async updateQuestion(): Promise<void> {
    throw new NotImplementedException(TEXTO_AINDA_NAO);
  }

  public async addQuestaoExistenteAProva(): Promise<void> {
    throw new NotImplementedException(TEXTO_AINDA_NAO);
  }

  // --- auxiliares ---

  private async frentesDeIdioma(): Promise<[Frente, Frente]> {
    return Promise.all([
      this.frenteRepository.getByFilter({ nome: Idioma.Ingles }),
      this.frenteRepository.getByFilter({ nome: Idioma.Espanhol }),
    ]);
  }

  private idiomaDaFrente(
    frente1: string | undefined,
    frenteIngles: Frente,
    frenteEspanhol: Frente,
  ): Idioma | null {
    if (frente1 && frente1 === frenteIngles?._id?.toString()) {
      return Idioma.Ingles;
    }
    if (frente1 && frente1 === frenteEspanhol?._id?.toString()) {
      return Idioma.Espanhol;
    }
    return null;
  }

  /**
   * ⚠️ De 1 a 5 cabem duas questões, mas **uma de cada idioma**. O
   * `verifyNumberProva` só conta (é o mesmo da 2017+); sem isto, duas de Inglês
   * no 3 deixariam o simulado Inglês com o 3 repetido e o Espanhol sem o 3.
   */
  private recusarIdiomaRepetido(
    prova: Prova,
    numero: number | undefined,
    idioma: Idioma | null,
    [frenteIngles, frenteEspanhol]: [Frente, Frente],
  ): void {
    if (!idioma || numero == null) return;
    const repetida = prova.questoes.some(
      (qc) =>
        qc.numero === numero &&
        this.idiomaDaFrente(
          frenteId(qc.questao as Questao),
          frenteIngles,
          frenteEspanhol,
        ) === idioma,
    );
    if (repetida) {
      throw new ConflictException(
        `A prova já tem a questão ${numero} de ${idioma}.`,
      );
    }
  }
}

export const TEXTO_AINDA_NAO =
  'Editar ou vincular questão na prova ENEM do cursinho ainda não está disponível.';

/** `frente1` populada (documento) ou só o id. */
function frenteId(questao?: Questao | null): string | undefined {
  const f = questao?.frente1 as unknown as
    | { _id?: { toString(): string } }
    | string
    | undefined;
  if (!f) return undefined;
  return typeof f === 'string' ? f : f._id?.toString();
}

/**
 * Para onde vai a questão (R3): a de Inglês só para o simulado Inglês, a de
 * Espanhol só para o Espanhol, as outras para todos os simulados da prova (os
 * dois do Dia 1, o único do Dia 2).
 *
 * ⚠️ Prova sem o simulado do idioma é recusada: entrar em nenhum simulado
 * deixaria a questão só na prova, sem erro.
 */
export function simuladosDoIdioma(
  prova: Pick<Prova, 'simulados'>,
  idioma: Idioma | null,
): Simulado[] {
  const simulados = prova.simulados ?? [];
  if (!idioma) return simulados;
  const doIdioma = simulados.filter((s) => s.idioma === idioma);
  if (doIdioma.length === 0) {
    throw new ConflictException(`A prova não tem o simulado de ${idioma}.`);
  }
  return doIdioma;
}
