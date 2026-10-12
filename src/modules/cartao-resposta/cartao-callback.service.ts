import { Injectable, Logger } from '@nestjs/common';
import { QueueProducer } from '../../shared/modules/queue/queue.producer';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { Alternativa } from '../questao/enums/alternativa.enum';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { Historico } from '../historico/historico.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { simuladoPelaLeitura } from '../prova/factory/simulado-pela-leitura';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';

const ALTERNATIVAS: ReadonlySet<string> = new Set<string>(
  Object.values(Alternativa),
);

interface CartaoCallbackInput {
  imageKey: string;
  respostas?: { questao: string; alternativaEstudante: string }[];
  falha?: { motivo: string; detalhe?: string };
  /** ⚠️ `null` é um valor REAL aqui: o ms-omr manda `"tentativaId": null`
   * quando o job não tem token. Ver a guarda em `processar`. */
  tentativaId?: string | null;
  /** tickets/038: os demais campos lidos (ex.: `idioma`). */
  campos?: Record<string, string> | null;
}

@Injectable()
export class CartaoCallbackService {
  private readonly logger = new Logger(CartaoCallbackService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly queueProducer: QueueProducer,
    // tickets/038: o cartão da prova escolhe o simulado no callback.
    private readonly provaRepository?: ProvaRepository,
    private readonly relatorioRepository?: RelatorioSimuladoEstudanteRepository,
  ) {}

  async processar(input: CartaoCallbackInput): Promise<void> {
    const historico = await this.historicoRepository.findByImageKey(
      input.imageKey,
    );
    if (!historico) {
      this.logger.warn(
        `callback sem histórico para imageKey ${input.imageKey}`,
      );
      return;
    }
    const histId = (
      historico as unknown as { _id: { toString(): string } }
    )._id.toString();

    // ⚠️ `?? undefined` normaliza `null` para ausente nas DUAS pontas, e não é
    // detalhe de estilo: o `callback.py` do ms-omr põe `"tentativaId": None` no
    // payload quando o job não tem token (job serializado antes do deploy), o
    // que chega aqui como `null`. Como `null !== undefined`, sem a
    // normalização esse callback seria lido como "tem token, e é diferente" e
    // DESCARTADO — exatamente o cartão preso em `awaiting_omr` que este card
    // promete evitar.
    const tokenDoHistorico =
      (historico as { tentativaId?: string }).tentativaId ?? undefined;
    const tokenDoCallback = input.tentativaId ?? undefined;

    // ⚠️ A guarda é por TOKEN, e não por status — e essa escolha é o que
    // preserva a varredura do card 13. Ela marca `failed` sem acionar o OMR,
    // logo NÃO muda o `tentativaId`: o callback legítimo que chegue depois
    // ainda bate e é aplicado, desfazendo o falso positivo. Uma guarda de
    // status recusaria exatamente esse callback, e o cartão ficaria errado
    // para sempre.
    if (
      tokenDoHistorico !== undefined &&
      tokenDoCallback !== undefined &&
      tokenDoCallback !== tokenDoHistorico
    ) {
      this.logger.warn(
        `callback de tentativa antiga descartado para ${input.imageKey}: ` +
          `recebido ${tokenDoCallback}, corrente ${tokenDoHistorico}`,
      );
      return;
    }

    // ⚠️ Token ausente de um lado ou do outro NÃO descarta, e isto é o que faz
    // o deploy sobreviver: ms-omr ainda velho, job enfileirado antes da
    // mudança, ou histórico criado antes deste card. O log é o sinal de quando
    // a transição terminou — quando ele parar de aparecer, o token pode virar
    // obrigatório.
    if (tokenDoHistorico === undefined || tokenDoCallback === undefined) {
      this.logger.log(
        `callback sem token para ${input.imageKey} ` +
          `(histórico: ${tokenDoHistorico ?? 'ausente'}, callback: ${tokenDoCallback ?? 'ausente'}) — aceito`,
      );
    }

    if (input.falha) {
      // o código vem cru do ms-omr de propósito: validar contra uma lista fechada
      // faria todo código novo daquele repo exigir deploy coordenado
      await this.historicoRepository.marcarFalha(
        histId,
        input.falha.motivo,
        input.falha.detalhe,
      );
      return;
    }

    const simuladoId = await this.simuladoDoHistorico(historico, histId, input);
    if (!simuladoId) return;
    const simulado = await this.simuladoRepository.answer(simuladoId);
    if (!simulado) {
      this.logger.warn(
        `callback: simulado ${simuladoId} não encontrado (histórico ${histId}) → Failed`,
      );
      await this.historicoRepository.marcarFalha(
        histId,
        CodigoFalhaInterno.SimuladoNaoEncontrado,
        `simulado ${simuladoId} não encontrado`,
      );
      return;
    }

    const numeroToId = new Map<number, string>();
    for (const qc of simulado.questoes) {
      numeroToId.set(qc.numero, (qc.questao as any)._id.toString());
    }

    // ⚠️ **A letra é filtrada aqui, e isto é o que torna a regra de
    // classificação verdadeira POR CONSTRUÇÃO.** A leitura do detalhe do
    // estudante trata "sem leitura" como a AUSÊNCIA de
    // `alternativaEstudante`; hoje o `cartao_reader.py` do ms-omr nunca emite
    // `""` nem `"AE"`, mas isso é uma observação sobre o OMR de agora, não uma
    // garantia do contrato — o DTO do callback não valida a letra. Se um dia
    // chegasse `""`, a questão contaria como ERRO e a tela mostraria a célula
    // "Marcou" VAZIA ao lado do selo "Errou", afirmando uma marcação que
    // ninguém leu.
    //
    // Entrada com letra inválida é DESCARTADA, não rejeitada: descartar a
    // deixa cair exatamente em "sem leitura", que é o que de fato aconteceu.
    // Um 400 no callback perderia o cartão inteiro por causa de uma questão.
    const rawRespostas = (input.respostas ?? [])
      .map((r) => {
        const questaoId = numeroToId.get(Number(r.questao));
        if (!questaoId) return null;
        if (!ALTERNATIVAS.has(r.alternativaEstudante)) {
          this.logger.warn(
            `callback ${input.imageKey}: alternativa inválida na questão ${r.questao} — resposta descartada (vira "sem leitura")`,
          );
          return null;
        }
        return {
          questao: questaoId,
          alternativaEstudante: r.alternativaEstudante,
        };
      })
      .filter(
        (r): r is { questao: string; alternativaEstudante: string } =>
          r !== null,
      );

    await this.historicoRepository.prepararParaProcessamento(
      histId,
      rawRespostas,
    );
    await this.queueProducer.publish('stream:simulado:answers', { histId });
  }

  /**
   * O simulado em que a leitura vai ser corrigida.
   *
   * - cartão do simulado (o de sempre): o do histórico;
   * - cartão DA PROVA (tickets/038, R8/R9): decidido AQUI, pelo idioma lido — a cada callback,
   *   e não só no primeiro: um reenvio com a foto nova pode ter o outro idioma. Grava no
   *   histórico e move a linha do relatório para ele.
   *
   * `null` = não dá para corrigir; o histórico já foi marcado como falho.
   */
  private async simuladoDoHistorico(
    historico: Historico,
    histId: string,
    input: CartaoCallbackInput,
  ): Promise<string | null> {
    const atual = historico.simulado
      ? (historico.simulado as any)?._id?.toString() ??
        historico.simulado.toString()
      : null;
    if (!historico.cartaoDaProva || !historico.prova || !this.provaRepository) {
      if (atual) return atual;
      await this.historicoRepository.marcarFalha(
        histId,
        CodigoFalhaInterno.SimuladoNaoEncontrado,
        'histórico sem simulado',
      );
      return null;
    }

    const prova = await this.provaRepository.buscarParaCartao(
      String(historico.prova),
    );
    const ids = (prova?.simulados ?? []).map(String);
    const escolhido = simuladoPelaLeitura(
      await this.simuladoRepository.buscarIdiomas(ids),
      input.campos?.idioma,
    );
    if (!escolhido) {
      this.logger.warn(
        `callback ${input.imageKey}: a prova ${String(historico.prova)} não tem simulado para o idioma "${input.campos?.idioma ?? ''}"`,
      );
      await this.historicoRepository.marcarFalha(
        histId,
        CodigoFalhaInterno.SimuladoNaoEncontrado,
        'a prova não tem simulado para o idioma lido',
      );
      return null;
    }
    /*
      ⚠️ **A linha do relatório PRIMEIRO, e sempre** (é idempotente). Antes ela só era movida
      quando o simulado mudava, e DEPOIS de gravá-lo no histórico: se o mover falhasse, o
      callback repetido pelo ms-omr já encontrava o simulado gravado, pulava o mover, e a linha
      ficava presa em "aguardando" com a leitura concluída (achado em homol, 2026-10-12).
    */
    await this.relatorioRepository?.moverParaSimulado(histId, escolhido);
    if (escolhido !== atual) {
      await this.historicoRepository.definirSimulado(histId, escolhido);
    }
    return escolhido;
  }
}
