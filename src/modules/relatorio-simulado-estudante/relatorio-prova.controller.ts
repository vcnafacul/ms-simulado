import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { ConsultarRelatorioDtoBody } from './dtos/consultar-relatorio.dto.body';
import {
  QuestoesDaProvaDtoOutput,
  RelatorioProvaDtoOutput,
} from './dtos/relatorio-prova.dto.output';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

/**
 * O relatório de uma PROVA — o agregado dos simulados dela (tickets/034).
 *
 * ⚠️ **Prefixo próprio, e não `v1/relatorio-simulado/prova/:id`.** Lá
 * `prova/:provaId` teria os mesmos dois segmentos de `:simuladoId/questoes`, e
 * quem responde passaria a depender da ordem de declaração — a classe de
 * defeito que nenhum teste de unidade pega.
 *
 * POST pelo mesmo motivo das rotas do simulado: a lista de usuários do recorte
 * vai no corpo.
 */
@ApiTags('Relatório de Simulado')
@Controller('v1/relatorio-prova')
export class RelatorioProvaController {
  constructor(private readonly service: RelatorioSimuladoEstudanteService) {}

  @Post(':provaId/questoes')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'agregado por questão dos simulados da prova, no recorte',
    type: QuestoesDaProvaDtoOutput,
  })
  @ApiResponse({ status: 404, description: 'prova inexistente' })
  async consultarQuestoes(
    @Param('provaId') provaId: string,
    @Body() body: ConsultarRelatorioDtoBody,
  ): Promise<QuestoesDaProvaDtoOutput> {
    validarProvaId(provaId);
    return this.service.consultarQuestoesDaProva({
      provaId,
      cursinhoId: body.cursinhoId,
      usuarios: body.usuarios,
    });
  }

  @Post(':provaId')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'linhas (uma por aplicação) dos simulados da prova',
    type: RelatorioProvaDtoOutput,
  })
  @ApiResponse({ status: 404, description: 'prova inexistente' })
  async consultar(
    @Param('provaId') provaId: string,
    @Body() body: ConsultarRelatorioDtoBody,
  ): Promise<RelatorioProvaDtoOutput> {
    validarProvaId(provaId);
    return this.service.consultarProva({
      provaId,
      cursinhoId: body.cursinhoId,
      usuarios: body.usuarios,
    });
  }
}

/** Sem isto `new Types.ObjectId` lança `BSONError` e vira 500 — é erro do chamador. */
function validarProvaId(provaId: string) {
  if (!Types.ObjectId.isValid(provaId)) {
    throw new BadRequestException(`provaId inválido: ${provaId}`);
  }
}
