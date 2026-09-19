import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConsultarRelatorioDtoInput } from './dtos/consultar-relatorio.dto.input';
import { RelatorioSimuladoDtoOutput } from './dtos/relatorio-simulado.dto.output';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

@ApiTags('Relatório de Simulado')
@Controller('v1/relatorio-simulado')
export class RelatorioSimuladoEstudanteController {
  constructor(private readonly service: RelatorioSimuladoEstudanteService) {}

  @Get(':simuladoId')
  @ApiResponse({
    status: 200,
    description: 'linhas do simulado no recorte do cursinho (ou da turma)',
    type: RelatorioSimuladoDtoOutput,
  })
  async consultar(
    @Param('simuladoId') simuladoId: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<RelatorioSimuladoDtoOutput> {
    return this.service.consultar({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }
}
