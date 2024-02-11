import { ApiProperty } from '@nestjs/swagger';
import { AnswerDTO } from './answer.dto.input';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerSimuladoDto {
  @ApiProperty()
  @IsNumber()
  idEstudante: number;

  @ApiProperty()
  @IsString()
  idSimulado: string;

  @ApiProperty({ type: AnswerDTO, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDTO)
  respostas: AnswerDTO[];

  @ApiProperty()
  @IsNumber()
  tempoRealizado: number;
}
