import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReprocessarCartaoDtoInput {
  /**
   * ⚠️ **No corpo, nunca no caminho.** Um path param cru já deixou o chamador
   * reescrever a URL que a api manda ao ms — um `?` embutido sobrepunha o
   * `cursinhoId` resolvido do JWT. Ver o `relatorio-http.service.ts` da api.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;

  /** Ausente = a foto não mudou; é o caminho do `reprocessar`. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  imageKey?: string;

  /** Do QR da foto nova. Obrigatório quando há `imageKey`. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  simuladoId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cartaoCode?: string;
}
