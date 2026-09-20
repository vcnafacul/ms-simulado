import { ValidationPipeOptions } from '@nestjs/common';

/**
 * A configuração do único `ValidationPipe` global do serviço.
 *
 * ⚠️ **Mora aqui, e não solta no `main.ts`, para poder ser testada.** Um teste
 * que montasse um pipe com estas mesmas opções escritas à mão não provaria
 * nada sobre o que o serviço realmente usa — seria decorativo. Importando
 * daqui, `validation-pipe.config.spec.ts` exercita a configuração de verdade.
 *
 * ⚠️ **Havia DOIS pipes globais.** O `main.ts` registrava este e, logo abaixo,
 * um `new ValidationPipe()` sem opções. `app.useGlobalPipes()` **acumula** —
 * não elege — então os dois rodavam em sequência, o segundo recebendo a saída
 * do primeiro. MEDIDO com dois pipes espiões numa app Nest real:
 *
 *     PIPES QUE RODARAM : ["PRIMEIRO(whitelist)","SEGUNDO(cru)"]
 *
 * A segunda passada era um no-op caro (um `plainToClass` + `validate` a mais
 * por requisição): com `transform: false` ela devolvia o valor que recebera.
 * MEDIDO em todos os DTOs com `@Type` do serviço — inclusive o
 * `@Type(() => Date)` do `UpdateDisponibilidadeDTO`, que continuava `Date`, e
 * o clamp do `GetAllDtoInput`, que é idempotente.
 *
 * O duplicado foi removido não pelo custo, que é desprezível, mas pela
 * armadilha: no dia em que alguém adicionasse um `@Transform` **não
 * idempotente**, o bug resultante não se explicaria lendo o pipe configurado.
 *
 * ⚠️ **O que depende destas opções** — MEDIDO nesta versão do Nest, porque a
 * divisão de trabalho entre as opções não é a intuitiva:
 *
 * | opções passadas ao pipe           | `limit=999999` vira | é instância? |
 * |-----------------------------------|---------------------|--------------|
 * | estas (`whitelist` + `transform`) | `500`               | sim          |
 * | `{ transform: false }` só         | `"999999"`          | não          |
 * | nenhuma (o pipe que foi removido) | `"999999"`          | não          |
 * | `{ whitelist: false }` só         | `500`               | não          |
 *
 * - `whitelist: true` remove campo não declarado no DTO. É o que impede um
 *   `?usuario[$ne]=` de virar operador de Mongo em `ConsultarHistoricoDtoInput`
 *   (card 11).
 * - `transform: true` decide se o controller recebe uma **instância da classe**
 *   ou um objeto puro. ⚠️ Não é ele que faz `@Transform` valer.
 * - `forbidNonWhitelisted: false` — campo extra é descartado em **silêncio**,
 *   não recusado com 400. É deliberado; mudar isto quebraria chamadores.
 *
 * ⚠️ **O que preserva o resultado de `@Transform`** (o clamp de `limit` do
 * `GetAllDtoInput`) é passar **qualquer opção de _validator_** — `whitelist` ou
 * `forbidNonWhitelisted`, mesmo que `false`. O Nest só devolve o objeto
 * validado quando `validatorOptions` recebeu alguma chave; sem nenhuma, ele
 * devolve o **valor original** e o clamp se perde. Por isso a quarta linha da
 * tabela clampa e a segunda não, apesar de parecerem equivalentes.
 *
 * Disso decorre por que o pipe duplicado era inofensivo: sozinho ele perderia
 * o clamp, mas rodava **depois** deste, recebendo o `500` já pronto.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
};
