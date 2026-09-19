import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConsultarRelatorioDtoInput {
  /**
   * OBRIGATÓRIO de propósito. Opcional aqui, a rota viraria "todas as linhas
   * deste simulado" e qualquer chamador enxergaria todos os cursinhos.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;

  /**
   * `@IsNotEmpty()` além do `@IsOptional()`: sem ele, `?turmaId=` (string
   * vazia) passa a validação e vira "restrinja à turma ''" — um seletor de
   * turma vazio na UI devolveria um relatório silenciosamente vazio em vez
   * do cursinho inteiro.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  turmaId?: string;
}
