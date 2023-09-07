import { ApiProperty } from '@nestjs/swagger';
import { RegraDTO } from './regra.dto';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TipoSimuladoUnique } from '../validator/tipo-simulado-unique.validator';
import { Type } from 'class-transformer';

export class CreateTipoSimuladoDTOInput {
  @ApiProperty()
  @IsString()
  @TipoSimuladoUnique({ message: 'nome tipo simulado já existe' })
  public nome: string;

  @ApiProperty()
  @IsNumber()
  public duracao: number;

  @ApiProperty()
  @IsNumber()
  public quantidadeTotalQuestao: number;

  @ApiProperty({ type: [RegraDTO], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RegraDTO)
  public regras: RegraDTO[];
}
