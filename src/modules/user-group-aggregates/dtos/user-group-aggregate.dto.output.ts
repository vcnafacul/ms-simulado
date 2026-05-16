import { ApiProperty } from '@nestjs/swagger';

export class FrenteAggregateDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  nome: string;

  @ApiProperty()
  aproveitamento: number;

  @ApiProperty()
  studentsContributing: number;

  @ApiProperty()
  attemptsContributing: number;
}

export class MateriaAggregateDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  nome: string;

  @ApiProperty()
  aproveitamento: number;

  @ApiProperty()
  studentsContributing: number;

  @ApiProperty()
  attemptsContributing: number;

  @ApiProperty({ type: [FrenteAggregateDto] })
  frentes: FrenteAggregateDto[];
}

export class AggregatePayloadDto {
  @ApiProperty()
  geral: number;

  @ApiProperty()
  totalAttempts: number;

  @ApiProperty()
  totalAttemptsCompleted: number;

  @ApiProperty()
  studentsWithAtLeastOneCompletedAttempt: number;

  @ApiProperty({ type: [MateriaAggregateDto] })
  materias: MateriaAggregateDto[];
}

export class UserGroupAggregateDtoOutput {
  @ApiProperty()
  groupId: string;

  @ApiProperty()
  groupType: 'class';

  @ApiProperty({ example: '2026-05' })
  month: string;

  @ApiProperty()
  monthStart: Date;

  @ApiProperty()
  monthEnd: Date;

  @ApiProperty({ type: [String] })
  userIds: string[];

  @ApiProperty()
  generatedAt: Date;

  @ApiProperty()
  sourceHistoricoCount: number;

  @ApiProperty()
  payload: AggregatePayloadDto;
}
