import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CartaoCallbackFalhaDtoInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  motivo: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  detalhe?: string;
}

export class CartaoCallbackDtoInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageKey: string;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  respostas?: { questao: string; alternativaEstudante: string }[];

  @ApiProperty({ required: false, type: CartaoCallbackFalhaDtoInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => CartaoCallbackFalhaDtoInput)
  falha?: CartaoCallbackFalhaDtoInput;
}
