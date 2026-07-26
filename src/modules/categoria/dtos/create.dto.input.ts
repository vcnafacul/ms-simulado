import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ExameExist } from '../../exame/validator/exame-exist.validator';

export class CreateCategoriaDTOInput {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  public nome?: string;

  @ApiProperty({
    required: false,
    description: 'Prefixo para auto-gerar o nome quando "nome" não é enviado',
  })
  @IsString()
  @IsOptional()
  public prefixo?: string;

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
