import { Injectable } from '@nestjs/common';
import { descreverFalha } from '../historico/falha/mapa-falha';
import {
  LinhaRelatorioDtoOutput,
  RelatorioSimuladoDtoOutput,
} from './dtos/relatorio-simulado.dto.output';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';

@Injectable()
export class RelatorioSimuladoEstudanteService {
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
      linhas: linhas.map((l) => this.montarLinha(l)),
      totalCartoesDoCursinhoNoSimulado: total,
    };
  }

  /**
   * ⚠️ `descreverFalha` é chamado AQUI, e nada no código força isso — é a
   * contrapartida de o card 01 derivar a descrição na service em vez de num
   * virtual do Mongoose. Sem ele a tela recebe `cartao_nao_detectado` cru.
   */
  private montarLinha(l: any): LinhaRelatorioDtoOutput {
    const h = l.historico;
    return {
      usuario: l.usuario,
      turmaId: l.turmaId,
      historicoId: h._id.toString(),
      status: h.status,
      cartaoCode: h.cartaoCode,
      questoesRespondidas: h.questoesRespondidas,
      // ausente, não zero — ver o docblock do DTO
      aproveitamentoGeral: h.aproveitamento?.geral,
      falha: descreverFalha(h.falha),
    };
  }
}
