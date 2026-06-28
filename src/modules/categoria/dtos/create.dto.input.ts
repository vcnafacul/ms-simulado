import { ApiProperty } from '@nestjs/swagger';
import { RegraDTO } from './regra.dto';
import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CategoriaUnique } from '../validator/categoria-unique.validator';
import { Type } from 'class-transformer';
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

  @ApiProperty({ type: [RegraDTO], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RegraDTO)
  public regras: RegraDTO[];

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
