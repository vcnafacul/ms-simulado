import { ApiProperty } from '@nestjs/swagger';
import { Edicao } from '../enums/edicao.enum';
import { IsEnum, IsNumber, IsString } from 'class-validator';
import { ExameExist } from 'src/modules/exame/validator/exame-exist.validator';

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
  @ExameExist({ message: 'exame não existe' })
  exame: string;

  @ApiProperty({ required: false, default: 0 })
  @IsNumber()
  totalQuestao: number;

  @ApiProperty()
  @IsString()
  filename: string;
}
