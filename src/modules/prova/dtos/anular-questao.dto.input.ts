import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Length } from 'class-validator';
import { MotivoAnulacao } from '../../questao/enums/motivo-anulacao.enum';

export const JUSTIFICATIVA_MIN = 10;
export const JUSTIFICATIVA_MAX = 500;

/** tickets/042, D3: motivo da lista + justificativa obrigatória. */
export class AnularQuestaoDTOInput {
  @ApiProperty({ enum: MotivoAnulacao })
  @IsEnum(MotivoAnulacao, { message: 'Motivo da anulação inválido.' })
  motivo: MotivoAnulacao;

  @ApiProperty({ minLength: JUSTIFICATIVA_MIN, maxLength: JUSTIFICATIVA_MAX })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'A justificativa é obrigatória.' })
  @Length(JUSTIFICATIVA_MIN, JUSTIFICATIVA_MAX, {
    message: `A justificativa deve ter de ${JUSTIFICATIVA_MIN} a ${JUSTIFICATIVA_MAX} caracteres.`,
  })
  justificativa: string;
}
