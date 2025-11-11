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
import { EnemArea } from '../enums/enem-area.enum';

export class UpdateClassificacaoDTOInput {
  @ApiProperty()
  @IsString()
  @ProvaExist({ message: 'prova não existe' })
  public prova: string;

  @ApiProperty()
  @IsNumber()
  public numero: number;

  @ApiProperty({ enum: EnemArea })
  @IsEnum(EnemArea)
  public enemArea: EnemArea;

  @ApiProperty()
  @IsString()
  @MateriaExist({ message: 'materia não existe' })
  public materia: string;

  @ApiProperty()
  @IsString()
  @FrenteExist({ message: 'frente não existe' })
  public frente1: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Frente2And3Exist({ message: 'frente não existe' })
  public frente2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Frente2And3Exist({ message: 'frente não existe' })
  public frente3?: string;

  @ApiProperty()
  @IsBoolean()
  public provaClassification: boolean;

  @ApiProperty()
  @IsBoolean()
  public subjectClassification: boolean;

  @ApiProperty()
  @IsBoolean()
  public reported: boolean;
}
