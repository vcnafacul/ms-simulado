import { ApiProperty } from '@nestjs/swagger';
import { Caderno } from '../enums/caderno.enum';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { EnemArea } from '../enums/enem-area.enum';
import { Alternativa } from '../enums/alternativa.enum';
import { ExameExist } from 'src/modules/exame/validator/exame-exist.validator';
import { FrenteExist } from 'src/modules/frente/validator/frente-exist.validator';
import { MateriaExist } from 'src/modules/materia/validator/materia-exist.validator';

export class CreateQuestaoDTOInput {
  @ApiProperty()
  @IsString()
  @ExameExist({ message: 'exame não existe' })
  exame: string;

  @ApiProperty()
  @IsNumber()
  public ano: number;

  @ApiProperty({ enum: Caderno })
  @IsEnum(Caderno)
  public caderno: Caderno;

  @ApiProperty({ enum: EnemArea })
  @IsEnum(EnemArea)
  public enemArea: EnemArea;

  @ApiProperty()
  @IsString()
  @FrenteExist({ message: 'frente não existe' })
  public frente1: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @FrenteExist({ message: 'frente não existe' })
  public frente2: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @FrenteExist({ message: 'frente não existe' })
  public frente3: string;

  @ApiProperty()
  @IsString()
  @MateriaExist({ message: 'materia não existe' })
  public materia: string;

  @ApiProperty()
  @IsNumber()
  public numero: number;

  @ApiProperty({ required: false })
  @IsOptional()
  public textoQuestao?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  public textoAlternativaA?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  public textoAlternativaB?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  public textoAlternativaC?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  public textoAlternativaD?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  public textoAlternativaE?: string;

  @ApiProperty({ enum: Alternativa })
  @IsEnum(Alternativa)
  public alternativa: Alternativa;

  @ApiProperty()
  @IsString()
  public imageId: string;
}
