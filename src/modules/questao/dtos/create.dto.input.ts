import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Frente2And3Exist } from 'src/modules/frente/validator/frente-2-and-3-exist.validator';
import { FrenteExist } from 'src/modules/frente/validator/frente-exist.validator';
import { MateriaExist } from 'src/modules/materia/validator/materia-exist.validator';
import { ProvaExist } from 'src/modules/prova/validator/prova-exist.validator';
import { Alternativa } from '../enums/alternativa.enum';
import { EnemArea } from '../enums/enem-area.enum';

export class CreateQuestaoDTOInput {
  @ApiProperty({ enum: EnemArea })
  @IsEnum(EnemArea)
  public enemArea: EnemArea;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @FrenteExist({ message: 'frente não existe' })
  public frente1: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Frente2And3Exist({ message: 'frente não existe' })
  public frente2: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Frente2And3Exist({ message: 'frente não existe' })
  public frente3: string;

  @ApiProperty({ required: false })
  @IsOptional()
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
  public pergunta?: string;

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
  @IsOptional()
  public imageId?: string | null;

  @ApiProperty()
  @IsString()
  @ProvaExist({ message: 'prova não existe' })
  public prova: string;

  @IsBoolean()
  @ApiProperty({ required: false })
  @IsOptional()
  public subjectClassification: boolean = false;

  @IsBoolean()
  @ApiProperty({ required: false })
  @IsOptional()
  public textClassification: boolean = false;

  @IsBoolean()
  @ApiProperty({ required: false })
  @IsOptional()
  public imageClassfication: boolean = false;

  @IsBoolean()
  @ApiProperty({ required: false })
  @IsOptional()
  public alternativeClassfication: boolean = false;
}
