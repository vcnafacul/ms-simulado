import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { AnularQuestaoDTOInput } from '../../prova/dtos/anular-questao.dto.input';
import { MODOS_DE_ENTRADA, ModoDeEntrada } from './entrada-com-anulacao.dto';
import { CreateQuestaoDTOInput } from './create.dto.input';

export class UpdateDTOInput extends PartialType(CreateQuestaoDTOInput) {
  @IsString()
  @ApiProperty()
  public _id: string;

  @IsBoolean()
  @ApiProperty({ required: false })
  @IsOptional()
  public provaClassification: boolean = false;

  @IsBoolean()
  @ApiProperty({ required: false })
  @IsOptional()
  public reported: boolean = false;

  /** tickets/042, D4: ao TROCAR de prova, como entrar se já foi anulada. */
  @ApiProperty({ required: false, enum: MODOS_DE_ENTRADA })
  @IsOptional()
  @IsIn(MODOS_DE_ENTRADA)
  public modo?: ModoDeEntrada;

  @ApiProperty({ required: false, type: AnularQuestaoDTOInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => AnularQuestaoDTOInput)
  public anulacao?: AnularQuestaoDTOInput;
}
