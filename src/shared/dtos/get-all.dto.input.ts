import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { GetAllInput } from '../base/interfaces/get-all.input';

/**
 * Teto de itens por pagina.
 *
 * ⚠️ **500, nao 200.** MEDIDO: a tela `partnerPrepProvas` pede `limit=500`
 * hoje, em producao, por uma rota que ja repassa o querystring
 * (`/cursinho/prova` → `getAllByCursinho`). Um teto de 200 seria regressao
 * numa tela fora do escopo deste conserto. 500 barra o `?limit=999999` sem
 * quebrar chamador real.
 *
 * ⚠️ O teto vale para os 12 controllers que usam este DTO (e para as
 * subclasses que o estendem), **de proposito**: a exposicao ja existia pela
 * rota do cursinho, que sempre repassou o querystring.
 */
export const LIMITE_MAXIMO = 500;

export class GetAllDtoInput implements GetAllInput {
  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  page: number = 1;

  @ApiProperty({ default: 40, required: false, maximum: LIMITE_MAXIMO })
  @IsOptional()
  // ⚠️ So corta o que passa do teto; **devolve o valor original intacto** em
  // qualquer outro caso. Coagir para Number aqui mudaria o `limit` que sai no
  // corpo de `GetAllDtoOutput` de `"10"` para `10` para todo cliente do ms --
  // uma quebra silenciosa, que e o modo de falha que este projeto persegue.
  //
  // ⚠️ Com o valor ausente o class-transformer nao chama o `@Transform`
  // (a chave nao existe no objeto de origem), entao o inicializador `= 40`
  // sobrevive. Ha teste para isso: se um dia passar a chamar com `undefined`,
  // o default some e o teste fica vermelho.
  @Transform(({ value }) => {
    const numero = Number(value);
    return Number.isFinite(numero) && numero > LIMITE_MAXIMO
      ? LIMITE_MAXIMO
      : value;
  })
  limit: number = 40;
}
