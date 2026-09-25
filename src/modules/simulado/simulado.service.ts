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
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import {
  AproveitamentoHistorico,
  MateriaAproveitamento,
  SubAproveitamento,
} from '../historico/types/aproveitamento';
import { MateriaRepository } from '../materia/materia.repository';
import { QuestaoRepository } from '../questao/questao.repository';
import { Questao } from '../questao/questao.schema';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { revalidarBloqueado } from './helpers/bloqueado';
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
import {
  calcularAproveitamento,
  montarRespostasAproveitamento,
} from './calcularAproveitamento';

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

  async incrementarCartaoSeq(id: string): Promise<number> {
    return this.simuladoRepository.incrementarCartaoSeq(id);
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

        // Liberado só se atingiu a quantidade da categoria, todas aprovadas e
        // todas numeradas.
        revalidarBloqueado(sml);

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
    // Não gera linha em RelatorioSimuladoEstudante: por decisão do card 08, só o
    // fluxo de cartão vincula a resposta a cursinho/turma. O online já aparece no
    // relatório genérico. A omissão é deliberada — ver simulado.module.spec.ts.
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
        await this.historicoRepository.marcarFalha(
          histId,
          CodigoFalhaInterno.RespostasAusentes,
          'histórico sem rawRespostas para processar',
        );
        return;
      }

      const simuladoId =
        (historico.simulado as any)?._id?.toString() ??
        historico.simulado.toString();
      const simulado = await this.simuladoRepository.answer(simuladoId);

      // Guard: simulado sem questões não tem o que processar — evita
      // TypeError no acesso a questoes[0] abaixo.
      if (!simulado.questoes.length) {
        await this.historicoRepository.marcarFalha(
          histId,
          CodigoFalhaInterno.SimuladoSemQuestoes,
          `simulado ${simuladoId} sem questões`,
        );
        return;
      }

      const ano = await this.questoesRepository.findAnoByQuestao(
        simulado.questoes[0].questao._id,
      );

      const respostasAproveitamento = montarRespostasAproveitamento(
        simulado.questoes.map((qc) => qc.questao),
        historico.rawRespostas,
      );

      const aproveitamento = await this.criaAproveitamento(
        respostasAproveitamento,
      );
      /*
        ⚠️ **As respostas ANTERIORES entram para serem descontadas** (card 21).

        `processAnswer` roda mais de uma vez no mesmo histórico: o reenvio de
        foto e o callback do OMR passam por `prepararParaProcessamento`, que
        devolve o status a `Pending` e republica na fila. A guarda
        `status === Completed` do `AnswerProcessorService` protege só a entrega
        duplicada — não o reprocessamento, que é o caminho que existe para
        reprocessar.

        ⚠️ **E `prepararParaProcessamento` NÃO limpa `respostas`** — o mesmo fato
        que os cards 12, 13 e 15 já usam. É por isso que a contagem antiga ainda
        está aqui para ser desfeita.

        ⚠️ Descontar, e não pular: na foto nova as respostas MUDARAM. Ignorar a
        segunda passada congelaria a leitura ruim que motivou o reenvio.
      */
      await this.questoesRepository.updateQuestionAnswered(
        respostasAproveitamento,
        historico.respostas ?? [],
      );

      /*
        ⚠️ Derivado de `respostasAproveitamento`, e **não** de
        `rawRespostas.length`. Os dois deveriam bater, mas `rawRespostas` é o
        que o ms-omr mandou — pode trazer questão que não está neste simulado
        (template errado, foto de cartão de outra prova). O `map` sobre
        `simulado.questoes` acima já é o gate; a contagem tem de sair de
        depois dele.

        ⚠️ Vale para os dois fluxos, de propósito. No digital o `createPending`
        já grava o campo com `answer.respostas.length` e aqui ele é reescrito
        com o mesmo número. Ter **um** escritor, no ponto em que a resposta é
        normalizada, é o que impede o próximo fluxo de entrada (importação,
        API pública) de nascer sem o campo — que foi exatamente o defeito do
        cartão-resposta.

        ⚠️ Não é mais gate de agregado nenhum (ver
        `user-group-aggregate.repository`): é a informação "leu 87 de 90".
      */
      const questoesRespondidas = respostasAproveitamento.filter(
        (r) => r.alternativaEstudante !== undefined,
      ).length;

      /*
        ⚠️ **Contado aqui, e não derivado do percentual depois** (card 08).
        `aproveitamento.geral` é uma fração já arredondada na exibição;
        multiplicá-la pelo total produz `44` onde o aluno fez `45`, e a tela e
        a planilha passam a discordar sobre um número que o aluno confere à
        mão contra o próprio cartão.

        ⚠️ Mesma razão de o `questoesRespondidas` acima ser gravado aqui: o
        relatório não pode pedir `respostas` no `select` (são 90 questões ×
        centenas de estudantes — medido em 824 KB por 100 linhas), então o que
        ele precisa contar tem de já estar contado no documento.
      */
      const acertos = respostasAproveitamento.filter(
        (r) =>
          r.alternativaEstudante !== undefined &&
          r.alternativaEstudante === r.alternativaCorreta,
      ).length;

      await this.historicoRepository.completeProcessing(histId, {
        ano,
        simulado,
        respostas: respostasAproveitamento.map((r) => ({
          questao: r.questao,
          alternativaEstudante: r.alternativaEstudante,
          alternativaCorreta: r.alternativaCorreta,
        })),
        aproveitamento,
        questoesRespondidas,
        acertos,
      });
    } catch (err) {
      await this.historicoRepository.marcarFalha(
        histId,
        CodigoFalhaInterno.ErroNoProcessamento,
        err instanceof Error ? err.message : String(err),
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

  /**
   * A nota do estudante: geral, por matéria e por frente.
   *
   * ⚠️ **Questão interdisciplinar conta INTEIRA em cada frente e em cada
   * matéria que ela toca** (card 14). Antes só `frente1` era considerada, e
   * 1.413 das 2.640 questões de homol têm uma secundária — o drill-down
   * subcontava metade da base.
   *
   * ⚠️ **As bases deixam de somar o total do simulado**, e isso é esperado: uma
   * prova de 10 questões pode ter 13 vínculos. Cada percentual passa a ser
   * "% de acerto nas questões que TOCAM isto", que é como o coordenador pensa —
   * e é por isso que a base tem de aparecer junto do número nas telas.
   *
   * ⚠️ `geral` continua sobre `respostas.length`, e **não** sobre os vínculos:
   * ele é a nota da prova, não a soma das partes. Contar interdisciplinar duas
   * vezes ali faria o aluno passar de 100%.
   *
   * ---
   *
   * ⚠️ **QUESTÃO NÃO LIDA CONTA COMO ERRO, e isso é decisão — não default**
   * (card 13). `respostas` é o mapa sobre TODAS as questões do simulado, então
   * a não lida entra no denominador e não no numerador.
   *
   * A fórmula era assim antes do card e continua assim depois dele; o que
   * mudou é que agora está escrito por quê. Três definições eram defensáveis:
   *
   * | | fórmula | |
   * |---|---|---|
   * | **A** | `acertos / total` | o aluno é responsável por marcar; alinhado com o ENEM |
   * | **B** | `acertos / lidas` | mede conhecimento, não preenchimento |
   * | **C** | A, **com a contagem de não lidas sempre ao lado** | ← **escolhida** |
   *
   * ⚠️ **B foi recusada por dois motivos, e o segundo é o que fecha:**
   *
   * 1. A nota do aluno **melhoraria quando a leitura do cartão dele piorasse**
   *    — o incentivo exatamente invertido. E dois alunos com 90 e 60 lidas
   *    teriam notas em bases diferentes, com a média da turma somando coisas
   *    incomparáveis.
   * 2. **O valor é GRAVADO aqui, no histórico.** Mudar a fórmula só afetaria
   *    históricos novos: o radar do `classSimuladoAnalytics` passaria a ter
   *    meses calculados de dois jeitos, e nada na tela diria isso. Só um
   *    recálculo retroativo de toda a base resolveria, e ele não se paga.
   *
   * ⚠️ E o que decidiria entre A e B — separar "deixou em branco" de "o OMR não
   * leu" — **não existe nos dados**: o `ms-omr` descarta os dois igualmente
   * (`cartao_reader.py:_estruturar_respostas`). Enquanto isso for verdade,
   * nenhuma fórmula separa os dois casos. C é a única honesta: não tenta
   * separar, mostra a ambiguidade.
   *
   * ⚠️ **Quem mostra é o client** (`resultadoDoEstudante.naoLidas`), derivando
   * de `questoesRespondidas` (card 01) e `totalDeQuestoes` (card 08) — sem
   * campo novo no contrato. **Não mexer nesta fórmula sem reabrir o card 13.**
   */
  private async criaAproveitamento(
    respostas: RespostaAproveitamento[],
  ): Promise<AproveitamentoHistorico> {
    // ⚠️ A regra mora em `calcularAproveitamento`, pura — o script de
    // recálculo dos históricos usa a MESMA função, nunca uma cópia dela.
    return calcularAproveitamento(respostas);
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
