import { ApiProperty } from '@nestjs/swagger';
import { AproveitamentoGeral } from '../types/aproveitamento';
import { GetPerformanceHistory } from './get-performance-history.dto';

export class GetPerformanceHistories {
  @ApiProperty()
  public performanceMateriaFrente: AproveitamentoGeral;

  @ApiProperty()
  public historicos: GetPerformanceHistory[];
}
