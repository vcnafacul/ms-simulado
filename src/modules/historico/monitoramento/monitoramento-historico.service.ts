import { Injectable } from '@nestjs/common';
import { HistoricoRepository } from '../historico.repository';
import { Period } from 'src/shared/enum/period';
import { SimuladosDoCursinhoRepository } from './simulados-do-cursinho.repository';

/**
 * Os números da seção Simulados do Monitoramento, recortados por cursinho
 * (tickets/044, card 04). As mesmas contas da plataforma (`HistoricoService`),
 * com o filtro dos simulados do cursinho. Sem cache aqui: ele fica na api (card 05).
 */
@Injectable()
export class MonitoramentoHistoricoService {
  constructor(
    private readonly historicos: HistoricoRepository,
    private readonly simulados: SimuladosDoCursinhoRepository,
  ) {}

  async resumo(cursinhoId: string) {
    const filtro = await this.simulados.filtroDeHistorico(cursinhoId);
    const [historicTotal, historicCompleted] = await Promise.all([
      this.historicos.getTotalEntity(filtro),
      this.historicos.entityCompleted(filtro),
    ]);
    return { historicTotal, historicCompleted };
  }

  async porPeriodo(cursinhoId: string, groupBy: Period) {
    const filtro = await this.simulados.filtroDeHistorico(cursinhoId);
    return this.historicos.aggregateByPeriod({ groupBy }, filtro);
  }

  async porTipo(cursinhoId: string, groupBy: Period) {
    const filtro = await this.simulados.filtroDeHistorico(cursinhoId);
    return this.historicos.aggregateByPeriodAndTipo({ groupBy }, filtro);
  }
}
