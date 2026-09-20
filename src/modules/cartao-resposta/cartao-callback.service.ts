import { Injectable, Logger } from '@nestjs/common';
import { QueueProducer } from '../../shared/modules/queue/queue.producer';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';
import { HistoricoRepository } from '../historico/historico.repository';
import { Alternativa } from '../questao/enums/alternativa.enum';
import { SimuladoRepository } from '../simulado/simulado.repository';

const ALTERNATIVAS: ReadonlySet<string> = new Set<string>(
  Object.values(Alternativa),
);

interface CartaoCallbackInput {
  imageKey: string;
  respostas?: { questao: string; alternativaEstudante: string }[];
  falha?: { motivo: string; detalhe?: string };
}

@Injectable()
export class CartaoCallbackService {
  private readonly logger = new Logger(CartaoCallbackService.name);

  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly queueProducer: QueueProducer,
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

    const simuladoId =
      (historico.simulado as any)?._id?.toString() ??
      historico.simulado.toString();
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
}
