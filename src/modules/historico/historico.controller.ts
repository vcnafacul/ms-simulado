import { Controller, Get, Query } from '@nestjs/common';
import { HistoricoService } from './historico.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Historico } from './historico.schema';

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
  async getAll(
    @Query('userId') userId: number,
  ) {
    return await this.service.getAllbyUser(userId);
  }
}
