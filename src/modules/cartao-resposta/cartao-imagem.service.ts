import { Injectable, NotFoundException } from '@nestjs/common';
import { HistoricoRepository } from '../historico/historico.repository';
import { Historico } from '../historico/historico.schema';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante/relatorio-simulado-estudante.repository';

/**
 * Onde está a foto de um cartão enviado — para o relatório oferecer o download
 * (quem baixa é a api, direto do bucket).
 *
 * ⚠️ **O mesmo gate do reprocessar:** a linha do relatório com `historico` E
 * `cursinhoId`. Histórico de outro cursinho responde igual a histórico que não
 * existe — 404, sem dizer qual dos dois.
 */
@Injectable()
export class CartaoImagemService {
  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly relatorioRepository: RelatorioSimuladoEstudanteRepository,
  ) {}

  async localizar(
    historicoId: string,
    cursinhoId: string,
  ): Promise<{ imageKey: string }> {
    const linha = await this.relatorioRepository.buscarPorHistorico(
      historicoId,
      cursinhoId,
    );
    if (!linha) {
      throw new NotFoundException('cartão não encontrado neste cursinho');
    }

    // `getByFilter` e não `getById`: ver o `CartaoReprocessoService`.
    const historico = (await this.historicoRepository.getByFilter({
      _id: historicoId,
    })) as Historico | null;
    // Histórico feito pela tela (sem cartão) não tem foto.
    if (!historico?.imageKey) {
      throw new NotFoundException('este histórico não tem foto de cartão');
    }
    return { imageKey: historico.imageKey };
  }
}
