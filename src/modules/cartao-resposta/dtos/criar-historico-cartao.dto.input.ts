import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CriarHistoricoCartaoDtoInput {
  @ApiProperty() @IsString() @IsNotEmpty() usuario: string;
  @ApiProperty() @IsString() @IsNotEmpty() imageKey: string;
  @ApiProperty() @IsString() @IsNotEmpty() cartaoCode: string;

  /**
   * Opcional de propósito: obrigatório faria o ms recusar todo upload entre o
   * seu deploy e o da api. A ausência vira log alto, não 400.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cursinhoId?: string;

  /** Ausente quando o estudante não tem turma — a linha é criada mesmo assim. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turmaId?: string;
}
