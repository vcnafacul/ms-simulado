import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { FrenteRepository } from 'src/modules/frente/frente.repository';
import { Frente } from 'src/modules/frente/frente.schema';
import { CreateQuestaoDTOInput } from 'src/modules/questao/dtos/create.dto.input';
import { UpdateDTOInput } from 'src/modules/questao/dtos/update.dto.input';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { Questao } from 'src/modules/questao/questao.schema';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { SimuladoService } from 'src/modules/simulado/simulado.service';
import { CategoriaRepository } from 'src/modules/categoria/categoria.repository';
import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { syncNumeroNaProvaESimulados } from '../helpers/question-container.helpers';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';
import { EnemService } from '../services/enem_service';
import { ExameName, IProvaFactory } from './types';

export class Enem2010_2017Factory implements IProvaFactory {
  constructor(
    private readonly categoriaRepository: CategoriaRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly provaRepository: ProvaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly simuladoService: SimuladoService,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly enemService: EnemService,
  ) {}

  async createProva(item: CreateProvaDTOInput): Promise<Prova> {
    const categoria = await this.categoriaRepository.getById(item.categoria);
    const prova = new Prova(item, categoria);
    prova.nome = `${categoria.nome} ${prova.ano} ${prova.edicao} ${prova.aplicacao}`;
    const hasProva = await this.enemService.getByName(prova.nome);
    if (!!hasProva) {
      throw new HttpException('Prova já esta cadastrada', HttpStatus.CONFLICT);
    }

    if (prova.categoria.nome === EnemArea.Enem1) {
      prova.enemAreas = [EnemArea.CienciasHumanas, EnemArea.BioExatas];
      prova.totalQuestao = 90;
    } else if (prova.categoria.nome === EnemArea.Enem2) {
      prova.enemAreas = [EnemArea.Linguagens, EnemArea.Matematica];
      prova.inicialNumero = 91;
      prova.totalQuestao = 95;
    }
    return prova;
  }

  public async createSimulados(prova: Prova) {
    if (prova.categoria.nome === EnemArea.Enem1) {
      await this.createSimuladoDia1(prova);
    } else if (prova.categoria.nome === EnemArea.Enem2) {
      await this.createSimuladoDia2(prova);
    }
  }

  public async createSimuladoDia1(prova: Prova) {
    const mainName = `${prova.categoria.nome} ${prova.ano}`;
    prova.simulados.push(
      await this.enemService.createSimuladoArea(
        prova,
        EnemArea.CienciasHumanas,
      ),
    );
    prova.simulados.push(
      await this.enemService.createSimuladoArea(prova, EnemArea.BioExatas),
    );
    prova.simulados.push(
      await this.simuladoRepository.create({
        nome: `${mainName}`,
        categoria: prova.categoria,
        questoes: [],
        descricao: `${prova.categoria.exame.nome}`,
        criadorId: prova.criadorId,
        cursinhoId: prova.cursinhoId,
      }),
    );
  }

  public async createSimuladoDia2(prova: Prova) {
    await this.enemService.createSimuladoIdiomatica(prova);
    prova.simulados.push(
      await this.enemService.createSimuladoArea(prova, EnemArea.Matematica),
    );
  }

  public async getMissingNumbers(prova: Prova): Promise<number[]> {
    const day2 = prova.nome.includes('Dia 2');
    const missingQuestion = [];
    if (day2) {
      for (let index = prova.inicialNumero; index <= 180; index++) {
        if (!prova.questoes.find((qc) => qc.numero === index)) {
          missingQuestion.push(index);
        } else {
          if (index > 90 && index < 96) {
            const hasAllQuestion =
              prova.questoes.filter((qc) => qc.numero === index).length < 2;
            if (hasAllQuestion) {
              missingQuestion.push(index);
            }
          }
        }
      }
    } else {
      for (let index = prova.inicialNumero; index <= 90; index++) {
        if (!prova.questoes.find((qc) => qc.numero === index)) {
          missingQuestion.push(index);
        }
      }
    }
    return missingQuestion;
  }

  public async verifyNumberProva(
    id: string,
    numberQuestion: number,
  ): Promise<boolean> {
    const prova = await this.provaRepository.getProvaWithQuestion(id);
    if (prova.questoes.some((qc) => qc.numero === numberQuestion)) {
      if (numberQuestion > 90 && numberQuestion < 96) {
        return (
          prova.questoes.filter((qc) => qc.numero === numberQuestion)
            .length < 2
        );
      }
      return false;
    }
    return true;
  }

  public async createQuestion(question: CreateQuestaoDTOInput) {
    // Cria a instância da questão com os dados recebidos
    const questao = Object.assign(new Questao(), question);

    // Busca as frentes necessárias em paralelo
    const [frenteIngles, frenteEspanhol] = await Promise.all([
      this.getFrenteByNome('Inglês'),
      this.getFrenteByNome('Espanhol'),
    ]);

    // Valida a questão conforme regras do ENEM
    await this.enemService.validate(
      question,
      frenteIngles,
      frenteEspanhol,
      91,
      95,
    );

    // Obtém a prova e prepara os simulados para atualizar
    const provaToEnter = await this.provaRepository.getById(question.prova);
    const isIngles = question.frente1 === frenteIngles._id.toString();
    const isEspanhol =
      !isIngles && question.frente1 === frenteEspanhol._id.toString();

    // Valida se é possível inserir a questão quando for de Inglês ou Espanhol
    if (isIngles || isEspanhol) {
      await this.validateInsertion(
        provaToEnter._id,
        question.numero,
        question.frente1,
      );
    }

    // Seleciona os simulados apropriados para a questão
    const simuladosToEnter = this.selectSimulados(
      provaToEnter,
      question,
      isIngles,
      isEspanhol,
    );

    // Inicia a sessão/transação
    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      const result = await this.questaoRepository.create(questao);
      await this.simuladoService.addQuestionSimulados(
        simuladosToEnter,
        result,
        question.numero,
        session,
      );
      await this.provaRepository.addQuestion(
        question.prova,
        result,
        question.numero,
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

  private async validateInsertion(
    provaId: string,
    numero: number,
    frente1: string,
  ): Promise<void> {
    const canInsert = await this.questaoRepository.canInsertQuestion(
      provaId,
      numero,
      frente1,
    );
    if (!canInsert) {
      throw new BadRequestException(
        `Questão ${numero} já cadastrada para essa prova`,
      );
    }
  }

  public async updateQuestion(question: UpdateDTOInput) {
    // Obtém a questão que será atualizada
    const questao = await this.questaoRepository.getByIdToUpdate(question._id);

    // Busca as frentes necessárias em paralelo
    const [frenteIngles, frenteEspanhol] = await Promise.all([
      this.getFrenteByNome('Inglês'),
      this.getFrenteByNome('Espanhol'),
    ]);

    // Valida a questão conforme as regras do ENEM
    await this.enemService.validate(
      question,
      frenteIngles,
      frenteEspanhol,
      91,
      95,
    );

    // Determina se houve mudança de prova ou de simulados
    const provaToLeaveId = await this.questaoRepository.findProvaAtual(
      question._id,
    );
    const provaToEnter = await this.provaRepository.getById(question.prova);
    const changeProva = provaToLeaveId !== provaToEnter._id.toString();
    const changeSimulados =
      changeProva ||
      question.enemArea !== questao.enemArea ||
      (question.enemArea === EnemArea.Linguagens &&
        question.frente1 !== questao.frente1._id.toString() &&
        (question.frente1 === frenteIngles._id.toString() ||
          question.frente1 === frenteEspanhol._id.toString() ||
          questao.frente1._id.toString() === frenteIngles._id.toString() ||
          questao.frente1._id.toString() === frenteEspanhol._id.toString()));

    // Seleciona os simulados a serem removidos, se necessário
    let simuladosToLeave: Simulado[] = [];
    if (changeSimulados && provaToLeaveId) {
      const oldProva = await this.provaRepository.getById(provaToLeaveId);
      simuladosToLeave = this.selectSimuladosToLeave(
        oldProva,
        questao,
        frenteIngles,
        frenteEspanhol,
      );
    }

    // Seleciona os simulados a serem adicionados
    let simuladosToEnter: Simulado[] = [];
    if (changeSimulados) {
      const isIngles = question.frente1 === frenteIngles._id.toString();
      const isEspanhol =
        !isIngles && question.frente1 === frenteEspanhol._id.toString();
      simuladosToEnter = this.selectSimulados(
        provaToEnter,
        question,
        isIngles,
        isEspanhol,
      );
    }

    // Inicia a sessão/transação
    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      const simuladosActuallyLeave =
        this.simuladoRepository.removeDuplicatedSimulados(
          simuladosToLeave,
          simuladosToEnter,
        );
      if (simuladosActuallyLeave.length > 0) {
        await this.simuladoService.removeQuestionSimulados(
          simuladosActuallyLeave,
          questao,
          session,
        );
        await this.provaRepository.removeQuestion(provaToLeaveId, questao);
      }
      const simuladosActuallyEnter =
        this.simuladoRepository.removeDuplicatedSimulados(
          simuladosToEnter,
          simuladosToLeave,
        );
      if (simuladosActuallyEnter.length > 0 || changeProva) {
        await this.simuladoService.addQuestionSimulados(
          simuladosActuallyEnter,
          questao,
          question.numero,
          session,
        );
        await this.provaRepository.addQuestion(
          question.prova,
          questao,
          question.numero,
        );
      }
      await this.questaoRepository.updateQuestion(question);
      // Numero-sync DENTRO da transação: reconcilia prova + simulados na mesma
      // session — se falhar, aborta a transação (evita numero dessincronizado
      // pós-commit).
      if (question.numero != null) {
        await syncNumeroNaProvaESimulados(
          this.provaRepository,
          this.simuladoRepository,
          question.prova,
          question._id,
          question.numero,
          session,
        );
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async addQuestaoExistenteAProva(
    questaoId: string,
    provaId: string,
    numero: number,
  ): Promise<void> {
    const questao = await this.questaoRepository.getByIdToUpdate(questaoId);

    const [frenteIngles, frenteEspanhol] = await Promise.all([
      this.getFrenteByNome('Inglês'),
      this.getFrenteByNome('Espanhol'),
    ]);

    const questionLike = {
      numero,
      enemArea: questao.enemArea,
      frente1: questao.frente1?._id?.toString(),
      prova: provaId,
    } as unknown as UpdateDTOInput;

    await this.enemService.validate(
      questionLike,
      frenteIngles,
      frenteEspanhol,
      91,
      95,
    );

    const provaToEnter = await this.provaRepository.getById(provaId);
    const isIngles = questionLike.frente1 === frenteIngles._id.toString();
    const isEspanhol =
      !isIngles && questionLike.frente1 === frenteEspanhol._id.toString();

    if (isIngles || isEspanhol) {
      await this.validateInsertion(provaToEnter._id, numero, questionLike.frente1);
    }

    const simuladosToEnter = this.selectSimulados(
      provaToEnter,
      questionLike,
      isIngles,
      isEspanhol,
    );

    const session = await this.questaoRepository.startSession();
    session.startTransaction();
    try {
      await this.simuladoService.addQuestionSimulados(
        simuladosToEnter,
        questao,
        numero,
        session,
      );
      await this.provaRepository.addQuestion(provaId, questao, numero, session);
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Busca a frente pelo nome (reaproveitada da função createQuestion)
  private async getFrenteByNome(nome: string): Promise<Frente> {
    return this.frenteRepository.getByFilter({ nome });
  }

  // Seleciona os simulados para entrada (compartilhada com a createQuestion)
  private selectSimulados(
    prova: Prova,
    question: CreateQuestaoDTOInput | UpdateDTOInput,
    isIngles: boolean,
    isEspanhol: boolean,
  ): Simulado[] {
    let simulados: Simulado[] = [];
    const dia2 = [EnemArea.Matematica, EnemArea.Linguagens].includes(
      question.enemArea,
    );
    if (dia2) {
      if (isIngles) {
        simulados = prova.simulados.filter((simulado) =>
          simulado.nome.includes('Inglês'),
        );
      } else if (isEspanhol) {
        simulados = prova.simulados.filter((simulado) =>
          simulado.nome.includes('Espanhol'),
        );
      } else {
        simulados = prova.simulados.filter((simulado) =>
          simulado.nome.includes(`${question.enemArea}`),
        );
        simulados = simulados.concat(
          prova.simulados.filter(
            (simulado) =>
              simulado.nome === `${prova.categoria.nome} ${prova.ano} Inglês` ||
              simulado.nome === `${prova.categoria.nome} ${prova.ano} Espanhol`,
          ),
        );
      }
    } else {
      simulados = prova.simulados.filter((simulado) =>
        simulado.nome.includes(`${question.enemArea}`),
      );
      const simuladoPadrao = prova.simulados.find(
        (simulado) => simulado.nome === `${prova.categoria.nome} ${prova.ano}`,
      );
      if (simuladoPadrao) {
        simulados.push(simuladoPadrao);
      }
    }
    return simulados;
  }

  // Seleciona os simulados para remoção, considerando o estado atual da questão
  private selectSimuladosToLeave(
    prova: Prova,
    questao: Questao,
    frenteIngles: Frente,
    frenteEspanhol: Frente,
  ): Simulado[] {
    let simulados: Simulado[] = [];
    const dia2 = [EnemArea.Matematica, EnemArea.Linguagens].includes(
      questao.enemArea,
    );
    if (
      prova.ano < 2010 ||
      prova.ano > 2016 ||
      prova.categoria.exame.nome !== ExameName.ENEM
    ) {
      simulados.push(...prova.simulados);
    } else {
      const wasIngles = questao.frente1._id === frenteIngles._id;
      const wasEspanhol =
        !wasIngles && questao.frente1._id === frenteEspanhol._id;
      if (dia2) {
        if (wasIngles) {
          simulados = prova.simulados.filter((simulado) =>
            simulado.nome.includes('Inglês'),
          );
        } else if (wasEspanhol) {
          simulados = prova.simulados.filter((simulado) =>
            simulado.nome.includes('Espanhol'),
          );
        } else {
          simulados = prova.simulados.filter((simulado) =>
            simulado.nome.includes(questao.enemArea),
          );
          simulados = simulados.concat(
            prova.simulados.filter(
              (simulado) =>
                simulado.nome === `${prova.categoria.nome} ${prova.ano} Inglês` ||
                simulado.nome === `${prova.categoria.nome} ${prova.ano} Espanhol`,
            ),
          );
        }
      } else {
        simulados = prova.simulados.filter((simulado) =>
          simulado.nome.includes(questao.enemArea),
        );
        const simuladoPadrao = prova.simulados.find(
          (simulado) => simulado.nome === `${prova.categoria.nome} ${prova.ano}`,
        );
        if (simuladoPadrao) {
          simulados.push(simuladoPadrao);
        }
      }
    }
    return simulados;
  }
}
