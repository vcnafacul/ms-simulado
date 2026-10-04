import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../../historico/historico.repository';
import { Historico } from '../../historico/historico.schema';
import { QuestaoRepository } from '../../questao/questao.repository';
import { RelatorioSimuladoEstudanteRepository } from '../../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';
import { CartaoExcluidoRepository } from './cartao-excluido.repository';

export const TEXTO_LEITURA_EM_ANDAMENTO =
  'A leitura deste cartão ainda está em andamento. Aguarde terminar para excluir.';

/**
 * Leitura terminada — com sucesso ou não. ⚠️ `awaiting_omr`, `pending` e
 * `processing` ficam de fora: o callback do OMR ou o processador da fila ainda
 * vão escrever neste histórico, e apagá-lo no meio faria o resultado cair num
 * documento que não existe (ou, pior, os contadores das questões subirem
 * depois de descontados).
 */
const STATUS_EXCLUIVEIS = [HistoricoStatus.Completed, HistoricoStatus.Failed];

const idDe = (v: unknown): string | undefined =>
  v == null
    ? undefined
    : String((v as { _id?: unknown })._id ?? (v as object).toString());

/**
 * Card 36 — "Excluir envio": desfaz um cartão enviado para o aluno errado.
 *
 * O que um cartão gerou, e onde cada coisa sai:
 * - o `Historico` → apagado de verdade (ver `excluirDefinitivo`);
 * - os contadores das questões (`quantidadeResposta`, `acertos`) → descontados
 *   com as `respostas` gravadas, o mesmo desconto do reprocessamento;
 * - a linha do relatório → apagada, e o estudante volta a "Não enviou";
 * - o painel do evento → lê o `Historico` na hora (`participantesPorCartao`),
 *   então sai sozinho;
 * - a foto → apagada pela api, que é quem tem o bucket (por isso a
 *   `imageKey` volta na resposta).
 *
 * ⚠️ **Fica de fora, de propósito:** o Desempenho da turma
 * (`user_group_aggregates`) é um agregado mensal; ele se corrige no próximo
 * cron ou no "Atualizar agora".
 */
@Injectable()
export class CartaoExclusaoService {
  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly cartaoExcluidoRepository: CartaoExcluidoRepository,
  ) {}

  async excluir(params: {
    historicoId: string;
    cursinhoId: string;
    excluidoPor: string;
  }): Promise<{
    imageKey: string | null;
    usuario: string;
    simuladoId: string | null;
  }> {
    const { historicoId, cursinhoId, excluidoPor } = params;

    // ⚠️ O mesmo gate do reprocessar e da foto: outro cursinho = 404.
    const linha = await this.relatorioRepository.buscarPorHistorico(
      historicoId,
      cursinhoId,
    );
    if (!linha) {
      throw new NotFoundException('cartão não encontrado neste cursinho');
    }

    // `getByFilter` e não `getById`: ver o `CartaoReprocessoService`.
    const atual = (await this.historicoRepository.getByFilter({
      _id: historicoId,
    })) as Historico | null;

    if (atual && !STATUS_EXCLUIVEIS.includes(atual.status)) {
      throw new ConflictException(TEXTO_LEITURA_EM_ANDAMENTO);
    }

    /*
      ⚠️ `atual` nulo com a linha do relatório viva = uma exclusão anterior
      parou no meio (o histórico saiu, a linha ficou). Não é 404: terminar a
      limpeza é o que a pessoa quer quando clica de novo.
    */
    const excluido = atual
      ? await this.historicoRepository.excluirDefinitivo(
          historicoId,
          STATUS_EXCLUIVEIS,
        )
      : null;

    // Entre a leitura e a exclusão o status mudou (reprocessar acionado).
    if (atual && !excluido) {
      throw new ConflictException(TEXTO_LEITURA_EM_ANDAMENTO);
    }

    if (excluido) {
      /*
        ⚠️ A auditoria vem ANTES dos descontos: se algo falhar daqui para a
        frente, o registro de quem apagou e do que havia já está gravado — e
        é ele que permite consertar à mão.
      */
      await this.cartaoExcluidoRepository.registrar({
        historicoId,
        usuario: excluido.usuario,
        simuladoId: idDe(excluido.simulado),
        cursinhoId,
        excluidoPor,
        status: excluido.status,
        imageKey: excluido.imageKey,
        historico: excluido as unknown as Record<string, unknown>,
      });

      /*
        ⚠️ Desconta sempre que houver `respostas`, e não só quando
        `completed`: um histórico `failed` num reprocessamento ainda guarda as
        respostas da leitura anterior — e elas foram contadas.
      */
      if (excluido.respostas?.length) {
        await this.questaoRepository.updateQuestionAnswered(
          [],
          excluido.respostas,
        );
      }
    }

    await this.relatorioRepository.excluirPorHistorico(historicoId);

    return {
      imageKey: excluido?.imageKey ?? null,
      usuario: linha.usuario,
      simuladoId: idDe(linha.simulado) ?? null,
    };
  }
}
