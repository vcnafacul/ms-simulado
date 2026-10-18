import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Period } from 'src/shared/enum/period';

/** tickets/044, card 04 — o recorte é obrigatório nestas rotas. */
export class MonitoramentoHistoricoDtoInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;
}

export class MonitoramentoHistoricoPeriodoDtoInput extends MonitoramentoHistoricoDtoInput {
  @ApiPropertyOptional({ enum: Period })
  @IsOptional()
  @IsEnum(Period)
  groupBy: Period = Period.month;
}
