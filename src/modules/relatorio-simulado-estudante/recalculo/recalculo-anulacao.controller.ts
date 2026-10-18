import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RecalculoAnulacaoService } from './recalculo-anulacao.service';

export class PedirRecalculoDtoBody {
  /** OBRIGATÓRIO: sem ele seria o simulado de todos os cursinhos. */
  @ApiProperty() @IsString() @IsNotEmpty() cursinhoId: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  solicitadoPor?: string;
}

export class ConsultarRecalculoDtoInput {
  @ApiProperty() @IsString() @IsNotEmpty() cursinhoId: string;
}

const ID = '[0-9a-fA-F]{24}';

/**
 * Recálculo por anulação (tickets/042, card 12), por simulado e por prova,
 * como o relatório do 034. ⚠️ Ids restritos no path: `:simuladoId/questoes`
 * e `:simuladoId/estudante/:usuario` vivem ao lado.
 */
@ApiTags('Relatório de Simulado')
@Controller('v1')
export class RecalculoAnulacaoController {
  constructor(private readonly service: RecalculoAnulacaoService) {}

  @Get(`relatorio-simulado/:simuladoId(${ID})/recalculo-anulacao`)
  @ApiResponse({
    status: 200,
    description: '{ divergentes, anulacoes, jobAtivo, ultimoJob }',
  })
  consultarDoSimulado(
    @Param('simuladoId') simuladoId: string,
    @Query() q: ConsultarRecalculoDtoInput,
  ) {
    return this.service.consultar({
      simuladoIds: [simuladoId],
      cursinhoId: q.cursinhoId,
    });
  }

  @Post(`relatorio-simulado/:simuladoId(${ID})/recalculo-anulacao`)
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'cria o job (ou devolve o ativo / "nada a recalcular")',
  })
  pedirDoSimulado(
    @Param('simuladoId') simuladoId: string,
    @Body() b: PedirRecalculoDtoBody,
  ) {
    return this.service.solicitar(
      { simuladoIds: [simuladoId], cursinhoId: b.cursinhoId },
      b.solicitadoPor,
    );
  }

  @Get(`relatorio-prova/:provaId(${ID})/recalculo-anulacao`)
  async consultarDaProva(
    @Param('provaId') provaId: string,
    @Query() q: ConsultarRecalculoDtoInput,
  ) {
    return this.service.consultar(
      await this.service.recorteDaProva(provaId, q.cursinhoId),
    );
  }

  @Post(`relatorio-prova/:provaId(${ID})/recalculo-anulacao`)
  @HttpCode(200)
  async pedirDaProva(
    @Param('provaId') provaId: string,
    @Body() b: PedirRecalculoDtoBody,
  ) {
    return this.service.solicitar(
      await this.service.recorteDaProva(provaId, b.cursinhoId),
      b.solicitadoPor,
    );
  }
}
