import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Edicao } from '../enums/edicao.enum';

/** Card 41 — só o que muda; campo ausente fica como está. */
export class EditarDadosProvaDTOInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  ano?: number;

  @ApiProperty({ enum: Edicao, required: false })
  @IsOptional()
  @IsEnum(Edicao)
  edicao?: Edicao;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  aplicacao?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId()
  categoria?: string;
}
