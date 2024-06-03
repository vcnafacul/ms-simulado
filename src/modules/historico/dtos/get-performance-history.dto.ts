import { ApiProperty } from '@nestjs/swagger';
import { AproveitamentoHistorico } from '../types/aproveitamento';

export class GetPerformanceHistory {
  @ApiProperty()
  public historyId: string;

  @ApiProperty()
  public testName: string;

  @ApiProperty()
  public performance: AproveitamentoHistorico;

  @ApiProperty()
  public timeSpent: number;

  @ApiProperty()
  public questionsAnswered: number;

  @ApiProperty()
  public totalQuestionsTest: number;

  @ApiProperty()
  public testPerformance: number;

  @ApiProperty()
  public testAttempts: number;

  @ApiProperty()
  public createdAt?: Date;
}
