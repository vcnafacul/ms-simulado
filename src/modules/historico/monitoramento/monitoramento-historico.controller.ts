import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  MonitoramentoHistoricoDtoInput,
  MonitoramentoHistoricoPeriodoDtoInput,
} from './monitoramento-historico.dto.input';
import { MonitoramentoHistoricoService } from './monitoramento-historico.service';

/**
 * tickets/044, card 04 — simulados do cursinho para o Monitoramento. Prefixo
 * próprio: as rotas globais (`v1/historico/summary`, `aggregate-by-Period*`)
 * ficam como estão.
 */
@ApiTags('Monitoramento')
@Controller('v1/monitoramento/historico')
export class MonitoramentoHistoricoController {
  constructor(private readonly service: MonitoramentoHistoricoService) {}

  @Get('resumo')
  async resumo(@Query() dto: MonitoramentoHistoricoDtoInput) {
    return this.service.resumo(dto.cursinhoId);
  }

  @Get('por-periodo')
  async porPeriodo(@Query() dto: MonitoramentoHistoricoPeriodoDtoInput) {
    return this.service.porPeriodo(dto.cursinhoId, dto.groupBy);
  }

  @Get('por-tipo')
  async porTipo(@Query() dto: MonitoramentoHistoricoPeriodoDtoInput) {
    return this.service.porTipo(dto.cursinhoId, dto.groupBy);
  }
}
