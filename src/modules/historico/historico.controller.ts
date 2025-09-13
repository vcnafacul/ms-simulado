import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AggregatePeriodDtoInput } from 'src/shared/dtos/aggregate-period.dto.input';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { Historico } from './historico.schema';
import { HistoricoService } from './historico.service';

@ApiTags('Historico')
@Controller('v1/historico')
export class HistoricoController {
  constructor(private service: HistoricoService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'obtém todos os históricos de simulados',
    type: Historico,
    isArray: true,
  })
  async getAll(@Query() dto: GetHistoricoDTOInput) {
    return await this.service.getAllbyUser(dto);
  }

  @Get('performance/:userId')
  @ApiResponse({
    status: 200,
    description: 'obtém histórico de performance por usuário',
    isArray: true,
  })
  async getPerformance(@Param('userId') userId: string) {
    return await this.service.getPerformance(userId);
  }

  @Get('summary')
  async getSummary() {
    return await this.service.getSummary();
  }

  @Get('aggregate-by-Period')
  async aggregateByPeriod(@Query() dto: AggregatePeriodDtoInput) {
    return await this.service.aggregateByPeriod(dto);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'obtém histórico detalhado por ID',
    type: Historico,
    isArray: false,
  })
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }
}
