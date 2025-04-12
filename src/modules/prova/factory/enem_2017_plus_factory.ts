import { HttpException, HttpStatus } from '@nestjs/common';
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

export class Enem2017PlusFactory implements IProvaFactory {
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
      prova.enemAreas = [EnemArea.Linguagens, EnemArea.CienciasHumanas];
      prova.totalQuestao = 95;
    } else if (prova.tipo.nome === EnemArea.Enem2) {
      prova.enemAreas = [EnemArea.BioExatas, EnemArea.Matematica];
      prova.inicialNumero = 91;
      prova.totalQuestao = 90;
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
    await this.enemService.createSimuladoIdiomatica(prova);
    prova.simulados.push(
      await this.enemService.createSimuladoArea(
        mainName,
        EnemArea.CienciasHumanas,
      ),
    );
  }

  public async createSimuladoDia2(prova: Prova) {
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    prova.simulados.push(
      await this.enemService.createSimuladoArea(mainName, EnemArea.Matematica),
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

  public async getMissingNumbers(prova: Prova): Promise<number[]> {
    const day1 = prova.nome.includes('Dia 1');
    const missingQuestion = [];
    if (day1) {
      for (let index = prova.inicialNumero; index <= 90; index++) {
        if (!prova.questoes.find((quest) => quest.numero === index)) {
          missingQuestion.push(index);
        } else {
          if (index < 6) {
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
      for (let index = prova.inicialNumero; index <= 180; index++) {
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
      if (numberQuestion < 6) {
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
    const questao = Object.assign(new Questao(), question);

    // Busca as frentes em paralelo
    const [frenteIngles, frenteEspanhol] = await Promise.all([
      this.getFrenteByNome('Inglês'),
      this.getFrenteByNome('Espanhol'),
    ]);

    // Validação conforme regras do ENEM (parâmetros 1 e 5 para provas de 2017+)
    await this.enemService.validate(
      question,
      frenteIngles,
      frenteEspanhol,
      1,
      5,
    );

    const provaToEnter = await this.provaRepository.getById(question.prova);
    // Define o "dia1" para Ciências Humanas e Linguagens
    const dia1 = [EnemArea.CienciasHumanas, EnemArea.Linguagens].includes(
      question.enemArea,
    );
    const isIngles = question.frente1 === frenteIngles._id.toString();
    const isEspanhol =
      !isIngles && question.frente1 === frenteEspanhol._id.toString();

    // Seleciona os simulados para entrada
    const simuladosToEnter = this.selectSimuladosToEnter(
      provaToEnter,
      question,
      isIngles,
      isEspanhol,
      dia1,
    );

    // Inicia a transação
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

  public async updateQuestion(question: UpdateDTOInput) {
    const questao = await this.questaoRepository.getByIdToUpdate(question._id);

    // Busca as frentes em paralelo
    const [frenteIngles, frenteEspanhol] = await Promise.all([
      this.getFrenteByNome('Inglês'),
      this.getFrenteByNome('Espanhol'),
    ]);

    await this.enemService.validate(
      question,
      frenteIngles,
      frenteEspanhol,
      1,
      5,
    );

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

    const dia1 = [EnemArea.CienciasHumanas, EnemArea.Linguagens].includes(
      question.enemArea,
    );

    let simuladosToLeave: Simulado[] = [];
    if (changeSimulados && provaToLeaveId) {
      const oldProva = await this.provaRepository.getById(provaToLeaveId);
      simuladosToLeave = this.selectSimuladosToLeave(
        oldProva,
        questao,
        frenteIngles,
        frenteEspanhol,
        dia1,
      );
    }

    let simuladosToEnter: Simulado[] = [];
    if (changeSimulados) {
      const isIngles = question.frente1 === frenteIngles._id.toString();
      const isEspanhol =
        !isIngles && question.frente1 === frenteEspanhol._id.toString();
      simuladosToEnter = this.selectSimuladosToEnter(
        provaToEnter,
        question,
        isIngles,
        isEspanhol,
        dia1,
      );
    }

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

  // --- Funções auxiliares ---

  private async getFrenteByNome(nome: string): Promise<Frente> {
    return this.frenteRepository.getByFilter({ nome });
  }

  /**
   * Seleciona os simulados para entrada com base no tipo de prova, área e se a questão é de Inglês ou Espanhol.
   */
  private selectSimuladosToEnter(
    prova: Prova,
    question: CreateQuestaoDTOInput | UpdateDTOInput,
    isIngles: boolean,
    isEspanhol: boolean,
    diaMode: boolean, // dia1: Ciências Humanas e Linguagens
  ): Simulado[] {
    let simulados: Simulado[] = [];
    if (diaMode) {
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
          simulado.nome.includes(question.enemArea),
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
        simulado.nome.includes(question.enemArea),
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

  /**
   * Seleciona os simulados para remoção com base na prova e no estado atual da questão.
   * Se a prova for anterior a 2017 ou não for do ENEM, retorna todos os simulados.
   */
  private selectSimuladosToLeave(
    prova: Prova,
    questao: Questao,
    frenteIngles: Frente,
    frenteEspanhol: Frente,
    diaMode: boolean, // dia1: Ciências Humanas e Linguagens
  ): Simulado[] {
    let simulados: Simulado[] = [];
    if (prova.ano < 2017 || prova.exame.nome !== ExameName.ENEM) {
      simulados = [...prova.simulados];
    } else {
      const wasIngles =
        questao.frente1._id.toString() === frenteIngles._id.toString();
      const wasEspanhol =
        !wasIngles &&
        questao.frente1._id.toString() === frenteEspanhol._id.toString();
      if (diaMode) {
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
