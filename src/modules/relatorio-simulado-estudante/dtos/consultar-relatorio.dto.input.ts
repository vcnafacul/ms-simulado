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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  turmaId?: string;
}
