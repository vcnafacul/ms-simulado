import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { CategoriaUnique } from '../validator/categoria-unique.validator';
import { ExameExist } from '../../exame/validator/exame-exist.validator';

export class CreateCategoriaDTOInput {
  @ApiProperty()
  @IsString()
  @CategoriaUnique({ message: 'nome categoria já existe' })
  public nome: string;

  @ApiProperty()
  @IsNumber()
  public duracao: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  public quantidadeTotalQuestao: number;

  @ApiProperty()
  @IsMongoId()
  @ExameExist({ message: 'exame não encontrado' })
  public exame: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  public custom: boolean;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  public selecionavel: boolean;

  @ApiProperty({ required: false, default: '' })
  @IsString()
  @IsOptional()
  public descricao: string;
}
