import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { QueueProducer } from 'src/shared/modules/queue/queue.producer';
import { HistoricoRepository } from '../historico/historico.repository';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import {
  AproveitamentoHistorico,
  MateriaAproveitamento,
  SubAproveitamento,
} from '../historico/types/aproveitamento';
import { MateriaRepository } from '../materia/materia.repository';
import { Status } from '../questao/enums/status.enum';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao } from '../questao/questao.schema';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { atingiuQuantidade } from './helpers/bloqueado';
import {
  addQuestaoToContainer,
  removeQuestaoFromContainer,
} from '../prova/helpers/question-container.helpers';
import {
  getAvailabilityStatus,
  isSimuladoAvailable,
} from './helpers/availability';
import { UpdateDisponibilidadeDTO } from './dtos/update-disponibilidade.dto.input';
import { AnswerSimuladoDto } from './dtos/answer-simulado.dto.input';
import { AvailableSimuladoDTOoutput } from './dtos/available-simulado.dto.output';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { Simulado } from './schemas/simulado.schema';
import { SimuladoRepository } from './simulado.repository';
import { RespostaAproveitamento } from './valueObject/resposta-aproveitamento';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly simuladoRepository: SimuladoRepository,
    private readonly questoesRepository: QuestaoRepository,
    private readonly categoriaRepository: CategoriaRepository,
    private readonly historicoRepository: HistoricoRepository,
    private readonly materiaRepository: MateriaRepository,
    private readonly queueProducer: QueueProducer,
  ) {}

  public async getById(id: string): Promise<Simulado | null> {
    return await this.simuladoRepository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Simulado>> {
    return await this.simuladoRepository.getAll(param);
  }

  public async delete(id: string) {
    await this.simuladoRepository.delete(id);
  }

  public async getToAnswer(
    simuladoId: string,
  ): Promise<SimuladoAnswerDTOOutput> {
    const simulado =
      await this.simuladoRepository.getAvailabilityById(simuladoId);
    if (!simulado) return null;

    // Gate rodado ANTES do try/catch: o try engole erros e retorna null,
    // então o 403 precisa ser lançado fora dele para propagar.
    if (!isSimuladoAvailable(simulado)) {
      throw new HttpException(
        {
          message: 'Simulado fora da janela de disponibilidade',
          status: getAvailabilityStatus(simulado),
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      return await this.GetSimulado(simuladoId);
    } catch (error) {
      return null;
    }
  }

  public async updateDisponibilidade(
    id: string,
    dto: UpdateDisponibilidadeDTO,
  ): Promise<Simulado> {
    const simulado = await this.simuladoRepository.getById(id);
    if (!simulado) throw new NotFoundException();

    // Valida contra os valores FINAIS (existente mesclado com o dto),
    // não só quando ambos vêm no payload — evita janela invertida
    // criada ao patchar um campo só.
    const finalDe =
      dto.disponivelDe !== undefined ? dto.disponivelDe : simulado.disponivelDe;
    const finalAte =
      dto.disponivelAte !== undefined
        ? dto.disponivelAte
        : simulado.disponivelAte;
    if (finalDe && finalAte && finalDe >= finalAte) {
      throw new BadRequestException(
        'disponivelDe deve ser anterior a disponivelAte',
      );
    }

    // PATCH parcial: só grava as chaves presentes no dto.
    // Omitido = inalterado; null explícito = limpa.
    const fields: { disponivelDe?: Date | null; disponivelAte?: Date | null } =
      {};
    if (dto.disponivelDe !== undefined) fields.disponivelDe = dto.disponivelDe;
    if (dto.disponivelAte !== undefined) {
      fields.disponivelAte = dto.disponivelAte;
    }

    await this.simuladoRepository.updateDisponibilidade(id, fields);
    return this.simuladoRepository.getById(id);
  }

  public async addQuestionSimulados(
    simulados: Simulado[],
    question: Questao,
    numero: number,
    session?: ClientSession,
  ) {
    await Promise.all(
      simulados.map(async (sml) => {
        // Adiciona a nova questão (single-write em questoes).
        addQuestaoToContainer(sml, question, numero);

        // Verifica se o simulado atingiu a quantidade total de questões
        // (categoria livre / quantidadeTotalQuestao null sempre "atinge")
        const atingiuQuantidadeTotal = atingiuQuantidade(
          sml.categoria.quantidadeTotalQuestao,
          sml.questoes.length,
        );
        // Verifica se todas as questões estão aprovadas
        const todasAprovadas = sml.questoes.every(
          (qc) => qc.questao.status === Status.Approved,
        );

        // Bloqueado = false só se todas adicionadas e aprovadas
        sml.bloqueado = !(atingiuQuantidadeTotal && todasAprovadas);

        return await this.simuladoRepository.updateSession(sml, session);
      }),
    );
  }

  public async removeQuestionSimulados(
    simulados: Simulado[],
    question: Questao,
    session: ClientSession = undefined,
  ) {
    await Promise.all(
      simulados.map(async (sml) => {
        const before = sml.questoes.length;
        removeQuestaoFromContainer(sml, question._id);
        if (sml.questoes.length !== before) {
          sml.bloqueado = true;
          await this.simuladoRepository.updateSession(sml, session);
        }
      }),
    );
  }

  public async answer(
    answer: AnswerSimuladoDto,
  ): Promise<{ histId: string; status: string }> {
    const pending = await this.historicoRepository.createPending({
      usuario: answer.idEstudante,
      simuladoId: answer.idSimulado,
      rawRespostas: answer.respostas,
      tempoRealizado: answer.tempoRealizado,
      questoesRespondidas: answer.respostas.length,
    });

    await this.queueProducer.publish('stream:simulado:answers', {
      histId: pending._id.toString(),
    });

    return { histId: pending._id.toString(), status: 'pending' };
  }

  public async processAnswer(histId: string): Promise<void> {
    const claimed = await this.historicoRepository.claimForProcessing(histId);
    if (!claimed) return;

    try {
      const historico = await this.historicoRepository.getById(histId);

      if (!historico?.rawRespostas) {
        await this.historicoRepository.updateStatus(
          histId,
          HistoricoStatus.Failed,
        );
        return;
      }

      const simuladoId =
        (historico.simulado as any)?._id?.toString() ??
        historico.simulado.toString();
      const simulado = await this.simuladoRepository.answer(simuladoId);

      const ano = (
        await this.questoesRepository.getById(
          simulado.questoes[0].questao._id,
        )
      ).prova.ano;

      const respostasAproveitamento: RespostaAproveitamento[] =
        simulado.questoes.map((qc) => {
          const questao = qc.questao;
          const resposta = historico.rawRespostas!.find(
            (r: any) => r.questao === questao._id.toString(),
          );
          return {
            questao,
            alternativaEstudante: resposta?.alternativaEstudante,
            alternativaCorreta: questao.alternativa,
            materia: questao.materia,
            frente: questao.frente1,
          };
        });

      const aproveitamento = await this.criaAproveitamento(
        respostasAproveitamento,
      );
      await this.questoesRepository.updateQuestionAnswered(
        respostasAproveitamento,
      );

      await this.historicoRepository.completeProcessing(histId, {
        ano,
        simulado,
        respostas: respostasAproveitamento.map((r) => ({
          questao: r.questao,
          alternativaEstudante: r.alternativaEstudante,
          alternativaCorreta: r.alternativaCorreta,
        })),
        aproveitamento,
      });
    } catch (err) {
      await this.historicoRepository.updateStatus(
        histId,
        HistoricoStatus.Failed,
      );
      throw err;
    }
  }

  private async GetSimulado(id: string) {
    const inicio = new Date(new Date().getTime() + 5);
    const simulado = await this.GetSimuladoById(id, inicio);
    return simulado;
  }

  private async GetSimuladoById(
    id: string,
    inicio: Date,
  ): Promise<SimuladoAnswerDTOOutput> {
    const simulado = await this.simuladoRepository.getById(id);
    return !simulado
      ? null
      : {
          _id: simulado._id,
          nome: simulado.nome,
          descricao: simulado.descricao,
          categoria: simulado.categoria._id,
          questoes: simulado.questoes.map((qc) => ({
            _id: qc.questao._id,
            enemArea: qc.questao.enemArea,
            frente1: qc.questao.frente1,
            frente2: qc.questao.frente2,
            frente3: qc.questao.frente3,
            materia: qc.questao.materia,
            numero: qc.numero,
            imageId: qc.questao.imageId,
            prova: qc.questao.prova,
          })),
          inicio: inicio,
          duracao: simulado.categoria.duracao,
        };
  }

  public async getAvailable(
    nomeTipo: string,
  ): Promise<AvailableSimuladoDTOoutput[]> {
    const categoria = await this.categoriaRepository.getByFilter({
      nome: nomeTipo,
    });
    return await this.simuladoRepository.getAvailable(categoria._id);
  }

  private async criaAproveitamento(
    respostas: RespostaAproveitamento[],
  ): Promise<AproveitamentoHistorico> {
    let aproveitamentoGeral = 0;

    // Extrai matérias únicas presentes nas respostas
    const materiasUnicas = new Map<string, MateriaAproveitamento>();

    respostas.forEach((res) => {
      const materiaId = res.materia._id.toString();

      // Inicializa a matéria se ainda não existir
      if (!materiasUnicas.has(materiaId)) {
        materiasUnicas.set(materiaId, {
          id: res.materia._id,
          nome: res.materia.nome,
          aproveitamento: 0,
          frentes: [],
        });
      }

      const materia = materiasUnicas.get(materiaId);

      // Adiciona a frente se ainda não existir nesta matéria
      const frenteId = res.frente._id.toString();
      if (!materia.frentes.some((f) => f.id.toString() === frenteId)) {
        materia.frentes.push({
          id: res.frente._id,
          nome: res.frente.nome,
          aproveitamento: 0,
          materia: res.materia.nome,
        });
      }
    });

    // Converte o Map para array
    const materias = Array.from(materiasUnicas.values());

    // Calcula o aproveitamento
    respostas.forEach((res) => {
      if (res.alternativaCorreta === res.alternativaEstudante) {
        aproveitamentoGeral++;
        this.increasePerformance(
          res,
          materias.find((m) => m.id.toString() === res.materia._id.toString()),
        );
      }
    });

    // Calcula o aproveitamento de cada matéria e frente
    materias.forEach((m) => {
      const quantidade = respostas.filter(
        (elem) => elem.materia._id.toString() === m.id.toString(),
      ).length;

      m.aproveitamento = quantidade > 0 ? m.aproveitamento / quantidade : 0;

      m.frentes.forEach((f) => {
        const quantidade = respostas.filter(
          (elem) => elem.frente._id.toString() === f.id.toString(),
        ).length;

        f.aproveitamento = quantidade > 0 ? f.aproveitamento / quantidade : 0;
      });
    });

    return {
      geral: aproveitamentoGeral / respostas.length,
      materias: materias,
    };
  }

  private increasePerformance(
    res: RespostaAproveitamento,
    materia: MateriaAproveitamento,
  ) {
    materia.aproveitamento++;
    this.calculaAproveitamento(res.frente._id.toString(), materia.frentes);
  }

  private calculaAproveitamento(id: string, array: Array<SubAproveitamento>) {
    if (id) {
      const index: number = array.findIndex((a) => a.id == id);
      if (index > -1) {
        array[index].aproveitamento++;
      }
    }
  }

  async getSummary() {
    const simuladosTotais = await this.simuladoRepository.getTotalEntity();
    const simuladosActived = await this.simuladoRepository.entityActived();

    return {
      simuladosTotais,
      simuladosActived,
    };
  }
}
