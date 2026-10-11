import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  /**
   * Do QR (tickets/038, R8a). Os dois são opcionais para aceitar a api antiga
   * (que só manda a `imageKey`, com o simulado no caminho):
   * - `simuladoId` presente → cartão do simulado;
   * - só `provaId` → cartão DA PROVA;
   * - nenhum → o id vem da `imageKey` e é um simulado (QR antigo).
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId()
  provaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId()
  simuladoId?: string;

  /** Ausente quando o estudante não tem turma — a linha é criada mesmo assim. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turmaId?: string;
}
