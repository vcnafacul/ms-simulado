import { Body, Controller, Delete, Param, Put } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Ator, AtorDaRequisicao } from 'src/shared/ator/ator';
import { AnularQuestaoDTOInput } from '../dtos/anular-questao.dto.input';
import { AnulacaoService } from './anulacao.service';

/**
 * tickets/042, card 03.
 *
 * ⚠️ **Sob `v1/prova`, nunca `v1/questao`:** o `QuestaoController` tem
 * `Patch(':id/:status')`, e um literal ali colide com o param. Aqui são 4
 * segmentos; as rotas do `ProvaController` têm no máximo 2.
 */
@ApiTags('Prova')
@Controller('v1/prova')
export class AnulacaoController {
  constructor(private readonly service: AnulacaoService) {}

  @Put(
    ':provaId([0-9a-fA-F]{24})/questoes/:questaoId([0-9a-fA-F]{24})/anulacao',
  )
  @ApiResponse({ status: 200, description: 'anula (ou edita a anulação)' })
  @ApiResponse({ status: 403, description: 'sem permissão nesta prova' })
  @ApiResponse({ status: 409, description: 'prova já aplicada (temporário)' })
  anular(
    @Param('provaId') provaId: string,
    @Param('questaoId') questaoId: string,
    @Body() dto: AnularQuestaoDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ) {
    return this.service.anular(provaId, questaoId, dto, ator);
  }

  @Delete(
    ':provaId([0-9a-fA-F]{24})/questoes/:questaoId([0-9a-fA-F]{24})/anulacao',
  )
  @ApiResponse({ status: 200, description: 'desanula' })
  desanular(
    @Param('provaId') provaId: string,
    @Param('questaoId') questaoId: string,
    @AtorDaRequisicao() ator?: Ator,
  ) {
    return this.service.desanular(provaId, questaoId, ator);
  }
}
