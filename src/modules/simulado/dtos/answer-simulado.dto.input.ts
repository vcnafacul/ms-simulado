import { ApiProperty } from '@nestjs/swagger';
import { Answer } from './answer.dto.input';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerSimulado {
  @ApiProperty()
  @IsNumber()
  idEstudante: number;

  @ApiProperty()
  @IsString()
  idSimulado: string;

  @ApiProperty({ type: Answer, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Answer)
  respostas: Answer[];
}
