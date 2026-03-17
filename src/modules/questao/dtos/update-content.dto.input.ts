import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Alternativa } from '../enums/alternativa.enum';

export class UpdateContentDTOInput {
  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  public textoQuestao: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  public pergunta?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaA: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaB: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaC: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaD: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaE: string;

  @ApiProperty({ enum: Alternativa })
  @IsEnum(Alternativa)
  public alternativa: Alternativa;

  @ApiProperty()
  @IsBoolean()
  public textClassification: boolean;

  @ApiProperty()
  @IsBoolean()
  public alternativeClassfication: boolean;

  @ApiProperty({ required: false, enum: ['plain', 'markdown'] })
  @IsOptional()
  @IsIn(['plain', 'markdown'])
  public contentFormat?: string;
}
