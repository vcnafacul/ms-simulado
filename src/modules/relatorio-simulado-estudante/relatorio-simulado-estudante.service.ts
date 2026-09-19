import { Injectable, Logger } from '@nestjs/common';
import { descreverFalha } from '../historico/falha/mapa-falha';
import {
  LinhaRelatorioDtoOutput,
  RelatorioSimuladoDtoOutput,
} from './dtos/relatorio-simulado.dto.output';
import {
  LinhaComHistorico,
  RelatorioSimuladoEstudanteRepository,
} from './relatorio-simulado-estudante.repository';

@Injectable()
export class RelatorioSimuladoEstudanteService {
  private readonly logger = new Logger(RelatorioSimuladoEstudanteService.name);

  constructor(
    private readonly repository: RelatorioSimuladoEstudanteRepository,
  ) {}

  async consultar(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<RelatorioSimuladoDtoOutput> {
    const [linhas, total] = await Promise.all([
      this.repository.buscarPorRecorte(params),
      // do CURSINHO, não da turma: é o denominador do rodapé
      this.repository.contarDoCursinho(params.simuladoId, params.cursinhoId),
    ]);

    return {
      // `flatMap`: uma linha órfã vira `[]` e some, sem derrubar as demais —
      // ver `montarLinha`.
      linhas: linhas.flatMap((l) => this.montarLinha(l, params.cursinhoId)),
      totalEstudantesComCartaoNoCursinho: total,
    };
  }

  /**
   * ⚠️ `descreverFalha` é chamado AQUI, e nada no código força isso — é a
   * contrapartida de o card 01 derivar a descrição na service em vez de num
   * virtual do Mongoose. Sem ele a tela recebe `cartao_nao_detectado` cru.
   *
   * `l.historico` pode vir `null`: o `Historico` referenciado foi apagado
   * depois do vínculo (a escrita tolera essa órfã de propósito — ver
   * `cartao-historico.service.ts`). Uma linha só não pode derrubar o
   * relatório do cursinho inteiro: ela é ignorada (`[]`) e o log guarda o
   * rastro para investigar. O estudante não some da tela — o card 04 monta
   * o relatório a partir dos ESTUDANTES e faz left join com estas linhas, então
   * quem ficou sem linha aqui aparece lá como "não enviou".
   */
  private montarLinha(
    l: LinhaComHistorico,
    cursinhoId: string,
  ): LinhaRelatorioDtoOutput[] {
    const h = l.historico;
    if (!h) {
      this.logger.error(
        `histórico inexistente para o usuário ${l.usuario} (cursinho ${cursinhoId}) — linha ignorada no relatório`,
      );
      return [];
    }

    return [
      {
        usuario: l.usuario,
        turmaId: l.turmaId,
        historicoId: h._id.toString(),
        status: h.status,
        cartaoCode: h.cartaoCode,
        questoesRespondidas: h.questoesRespondidas,
        // ausente, não zero — ver o docblock do DTO
        aproveitamentoGeral: h.aproveitamento?.geral,
        falha: descreverFalha(h.falha),
      },
    ];
  }
}
