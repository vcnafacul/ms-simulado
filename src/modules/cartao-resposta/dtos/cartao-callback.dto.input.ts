import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CartaoCallbackDtoInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageKey: string;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  respostas?: { questao: string; alternativaEstudante: string }[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  falha?: { motivo: string; detalhe?: string };
}
