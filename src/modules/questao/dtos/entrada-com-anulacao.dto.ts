import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, ValidateNested } from 'class-validator';
import { AnularQuestaoDTOInput } from '../../prova/dtos/anular-questao.dto.input';

/**
 * Como a questão entra numa prova quando ela já foi anulada em outra
 * (tickets/042, D4). Sem `modo`, a questão anulada recebe 409 `QUESTAO_ANULADA`
 * com a lista — é o modal do client.
 */
export const MODOS_DE_ENTRADA = ['normal', 'anulada'] as const;
export type ModoDeEntrada = (typeof MODOS_DE_ENTRADA)[number];

export class EntradaComAnulacaoDTO {
  @ApiProperty({ enum: MODOS_DE_ENTRADA, required: false })
  @IsOptional()
  @IsIn(MODOS_DE_ENTRADA)
  modo?: ModoDeEntrada;

  /** Obrigatória com `modo: 'anulada'` (validada no service). */
  @ApiProperty({ type: AnularQuestaoDTOInput, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnularQuestaoDTOInput)
  anulacao?: AnularQuestaoDTOInput;
}
