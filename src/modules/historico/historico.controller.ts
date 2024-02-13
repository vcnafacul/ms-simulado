import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
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
  async getAll(@Query('userId') userId: number) {
    return await this.service.getAllbyUser(userId);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'obtém histórico detalhado por ID',
    type: Historico,
    isArray: true,
  })
  async getById(@Param('id') id: string) {
    return await this.service.getById(id);
  }
}
