import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Alternativa } from '../enums/alternativa.enum';

export class UpdateContentDTOInput {
  @ApiProperty()
  @IsString()
  public textoQuestao: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  public pergunta?: string;

  @ApiProperty()
  @IsString()
  public textoAlternativaA: string;

  @ApiProperty()
  @IsString()
  public textoAlternativaB: string;

  @ApiProperty()
  @IsString()
  public textoAlternativaC: string;

  @ApiProperty()
  @IsString()
  public textoAlternativaD: string;

  @ApiProperty()
  @IsString()
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
}
