import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { ConsultarRelatorioDtoInput } from './dtos/consultar-relatorio.dto.input';
import { QuestoesDoRelatorioDtoOutput } from './dtos/questoes-do-relatorio.dto.output';
import { RelatorioSimuladoDtoOutput } from './dtos/relatorio-simulado.dto.output';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

@ApiTags('Relatório de Simulado')
@Controller('v1/relatorio-simulado')
export class RelatorioSimuladoEstudanteController {
  constructor(private readonly service: RelatorioSimuladoEstudanteService) {}

  @Get(':simuladoId/questoes')
  @ApiResponse({
    status: 200,
    description: 'agregado por questão no recorte do cursinho (ou da turma)',
    type: QuestoesDoRelatorioDtoOutput,
  })
  async consultarQuestoes(
    @Param('simuladoId') simuladoId: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<QuestoesDoRelatorioDtoOutput> {
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultarQuestoes({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }

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
    // Sem isto, `new Types.ObjectId(simuladoId)` no repositório lança
    // `BSONError` para qualquer coisa que não seja 24 hex — e vira 500. Um
    // typo de :simuladoId numa rota proxied pela api é erro do CHAMADOR, não
    // do ms — tem que ser 400, não um 500 sem pista nos logs de um serviço
    // que o time da api não é dono.
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultar({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }
}
