import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { EnemArea } from '../enums/enem-area.enum';
import { Alternativa } from '../enums/alternativa.enum';
import { FrenteExist } from 'src/modules/frente/validator/frente-exist.validator';
import { MateriaExist } from 'src/modules/materia/validator/materia-exist.validator';
import { ProvaExist } from 'src/modules/prova/validator/prova-exist.validator';

export class CreateQuestaoDTOInput {
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

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  public classificationExam: boolean;
  
  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  public classificationFront: boolean;
  
  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  public image: boolean;
  
  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  public questionText: boolean;
  
  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  public rightAnswer: boolean;

  @ApiProperty()
  @IsString()
  @ProvaExist({ message: 'prova não existe' })
  public prova: string;
}
