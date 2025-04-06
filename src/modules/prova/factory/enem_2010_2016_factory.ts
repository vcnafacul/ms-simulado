import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Exame } from 'src/modules/exame/exame.schema';
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
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';
import { EnemService } from '../services/enem_service';
import { ExameName, IProvaFactory } from './types';

export class Enem2010_2017Factory implements IProvaFactory {
  constructor(
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly provaRepository: ProvaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly simuladoService: SimuladoService,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly enemService: EnemService,
    private exame: Exame,
  ) {}

  async createProva(item: CreateProvaDTOInput): Promise<Prova> {
    const tipo = await this.tipoSimuladoRepository.getById(item.tipo);
    const prova = new Prova(item, this.exame, tipo);
    prova.nome = `${tipo.nome} ${prova.ano} ${prova.edicao} ${prova.aplicacao}`;
    const hasProva = await this.enemService.getByName(prova.nome);
    if (!!hasProva) {
      throw new HttpException('Prova já esta cadastrada', HttpStatus.CONFLICT);
    }

    if (prova.tipo.nome === EnemArea.Enem1) {
      prova.enemAreas = [EnemArea.CienciasHumanas, EnemArea.BioExatas];
      prova.totalQuestao = 90;
    } else if (prova.tipo.nome === EnemArea.Enem2) {
      prova.enemAreas = [EnemArea.Linguagens, EnemArea.Matematica];
      prova.inicialNumero = 91;
      prova.totalQuestao = 95;
    }
    return prova;
  }

  public async createSimulados(prova: Prova) {
    if (prova.tipo.nome === EnemArea.Enem1) {
      await this.createSimuladoDia1(prova);
    } else if (prova.tipo.nome === EnemArea.Enem2) {
      await this.createSimuladoDia2(prova);
    }
  }

  public async createSimuladoDia1(prova: Prova) {
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    prova.simulados.push(
      await this.enemService.createSimuladoArea(
        mainName,
        EnemArea.CienciasHumanas,
      ),
    );
    prova.simulados.push(
      await this.enemService.createSimuladoArea(mainName, EnemArea.BioExatas),
    );
    prova.simulados.push(
      await this.simuladoRepository.create({
        nome: `${mainName}`,
        tipo: prova.tipo,
        questoes: [],
        descricao: `${prova.exame.nome}`,
      }),
    );
  }

  public async createSimuladoDia2(prova: Prova) {
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    await this.enemService.createSimuladoIdiomatica(prova);
    prova.simulados.push(
      await this.enemService.createSimuladoArea(mainName, EnemArea.Matematica),
    );
  }

  public async getMissingNumbers(prova: Prova): Promise<number[]> {
    const day2 = prova.nome.includes('Dia 2');
    const missingQuestion = [];
    if (day2) {
      for (let index = prova.inicialNumero; index <= 180; index++) {
        if (!prova.questoes.find((quest) => quest.numero === index)) {
          missingQuestion.push(index);
        } else {
          if (index > 90 && index < 96) {
            const hasAllQuestion =
              prova.questoes.filter((quest) => quest.numero === index).length <
              2;
            if (hasAllQuestion) {
              missingQuestion.push(index);
            }
          }
        }
      }
    } else {
      for (let index = prova.inicialNumero; index <= 90; index++) {
        if (!prova.questoes.find((quest) => quest.numero === index)) {
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
    if (prova.questoes.some((quest) => quest.numero === numberQuestion)) {
      if (numberQuestion > 90 && numberQuestion < 96) {
        return (
          prova.questoes.filter((quest) => quest.numero === numberQuestion)
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
    const provaToLeaveId = questao.prova?._id.toString();
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
              simulado.nome === `${prova.tipo.nome} ${prova.ano} Inglês` ||
              simulado.nome === `${prova.tipo.nome} ${prova.ano} Espanhol`,
          ),
        );
      }
    } else {
      simulados = prova.simulados.filter((simulado) =>
        simulado.nome.includes(`${question.enemArea}`),
      );
      const simuladoPadrao = prova.simulados.find(
        (simulado) => simulado.nome === `${prova.tipo.nome} ${prova.ano}`,
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
      prova.exame.nome !== ExameName.ENEM
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
                simulado.nome === `${prova.tipo.nome} ${prova.ano} Inglês` ||
                simulado.nome === `${prova.tipo.nome} ${prova.ano} Espanhol`,
            ),
          );
        }
      } else {
        simulados = prova.simulados.filter((simulado) =>
          simulado.nome.includes(questao.enemArea),
        );
        const simuladoPadrao = prova.simulados.find(
          (simulado) => simulado.nome === `${prova.tipo.nome} ${prova.ano}`,
        );
        if (simuladoPadrao) {
          simulados.push(simuladoPadrao);
        }
      }
    }
    return simulados;
  }
}
