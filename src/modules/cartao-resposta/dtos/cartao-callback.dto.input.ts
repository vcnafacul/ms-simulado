import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
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

  /**
   * ⚠️ **`@IsArray()` e só: a letra NÃO é validada aqui, de propósito.**
   * `@IsEnum(Alternativa)` por item recusaria o callback INTEIRO por causa de
   * uma questão mal lida, e perder o cartão todo é pior que perder a questão.
   * Quem faz valer o invariante é o `CartaoCallbackService`, que DESCARTA a
   * entrada cuja `alternativaEstudante` não é membro de `Alternativa` — assim
   * a questão cai em "sem leitura", que é o que de fato aconteceu.
   *
   * Isso importa porque a classificação do detalhe do estudante lê "sem
   * leitura" como a AUSÊNCIA da chave: sem o descarte, um `""` vindo do OMR
   * viraria ERRO com a célula "Marcou" vazia na tela.
   */
  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  respostas?: { questao: string; alternativaEstudante: string }[];

  @ApiProperty({ required: false, type: CartaoCallbackFalhaDtoInput })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CartaoCallbackFalhaDtoInput)
  falha?: CartaoCallbackFalhaDtoInput;
}
