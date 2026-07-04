import { ApiProperty } from '@nestjs/swagger';
import { Edicao } from '../enums/edicao.enum';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CategoriaExist } from 'src/modules/categoria/validator/categoria-exist.validator';

export class CreateProvaDTOInput {
  @ApiProperty({ enum: Edicao, required: false, default: Edicao.Regular })
  @IsEnum(Edicao)
  edicao: Edicao;

  @ApiProperty({ required: false })
  @IsNumber()
  aplicacao: number;

  @ApiProperty()
  @IsNumber()
  ano: number;

  @ApiProperty()
  @IsString()
  @CategoriaExist({ message: 'categoria não existe' })
  categoria: string;

  @ApiProperty()
  @IsString()
  filename: string;

  @ApiProperty()
  @IsOptional()
  gabarito?: string;
}
