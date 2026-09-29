import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AggregatePeriodDtoInput } from 'src/shared/dtos/aggregate-period.dto.input';
import { ConsultarHistoricoDtoInput } from './dtos/consultar-historico.dto.input';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { ParticipantesPorCartaoDtoInput } from './dtos/participantes-por-cartao.dto.input';
import { Historico } from './historico.schema';
import { HistoricoService } from './historico.service';

@ApiTags('Historico')
@Controller('v1/historico')
export class HistoricoController {
  constructor(private service: HistoricoService) {}

  /**
   * tickets/026, card 05 — quem fez os simulados de um evento presencial.
   * POST porque leva a lista de simulados no corpo; não escreve nada.
   */
  @Post('participantes-por-cartao')
  @HttpCode(200)
  @ApiResponse({ status: 200, description: '{ simuladoId: usuarios[] }' })
  async participantesPorCartao(@Body() dto: ParticipantesPorCartaoDtoInput) {
    return await this.service.participantesPorCartao(
      dto.simuladoIds,
      dto.desde,
    );
  }

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

  @Get('aggregate-by-Period-and-Type')
  async aggregateByPeriodAndTipo(@Query() dto: AggregatePeriodDtoInput) {
    return await this.service.aggregateByPeriodAndTipo(dto);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'obtém histórico detalhado por ID',
    type: Historico,
    isArray: false,
  })
  async getById(
    @Param('id') id: string,
    @Query() dto: ConsultarHistoricoDtoInput,
  ) {
    return await this.service.getById(id, dto.usuario);
  }
}
