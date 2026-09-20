import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ConsultarHistoricoDtoInput } from './consultar-historico.dto.input';

/**
 * ⚠️ **Os decorators deste DTO são o gate contra injeção de operador do
 * Mongo — não são decoração de Swagger.**
 *
 * O repositório faz `findOne({ _id: id, usuario })` com o valor que chega
 * aqui. Se `usuario` puder ser um OBJETO, `?usuario[$ne]=` vira
 * `findOne({ _id, usuario: { $ne: '' } })` — que casa com o documento de um
 * estranho e devolve o histórico dele. Se puder ser VAZIO, o filtro deixa de
 * filtrar.
 *
 * Os dois `it.each` abaixo existem porque tirar `@IsNotEmpty()` ou
 * `@IsString()` do DTO não quebrava NADA na suíte antes deste card. A
 * `ValidationPipe` é instanciada com as mesmas opções do `main.ts`.
 */
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
});

const meta: ArgumentMetadata = {
  type: 'query',
  metatype: ConsultarHistoricoDtoInput,
  data: undefined,
};

describe('ConsultarHistoricoDtoInput — o gate contra operador do Mongo', () => {
  // ⚠️ Estes dois matam o mutante "tirei o @IsString()": um objeto e um array
  // passam por `@IsNotEmpty()` sem reclamar.
  it.each([
    ['?usuario[$ne]= vira um objeto', { usuario: { $ne: '' } }],
    ['?usuario[$gt]= vira um objeto', { usuario: { $gt: '' } }],
    ['?usuario=a&usuario=b vira um array', { usuario: ['a', 'b'] }],
  ])('recusa %s', async (_nome, valor) => {
    await expect(pipe.transform(valor, meta)).rejects.toMatchObject({
      status: 400,
    });
  });

  // ⚠️ E estes dois matam o mutante "tirei o @IsNotEmpty()": a string vazia
  // passa por `@IsString()` sem reclamar, e o filtro para de filtrar.
  it.each([
    ['usuario vazio', { usuario: '' }],
    ['usuario ausente', {}],
  ])('recusa %s', async (_nome, valor) => {
    await expect(pipe.transform(valor, meta)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('e deixa passar um usuario de verdade', async () => {
    const saida = await pipe.transform({ usuario: 'u-dono' }, meta);

    expect(saida).toBeInstanceOf(ConsultarHistoricoDtoInput);
    expect(saida.usuario).toBe('u-dono');
  });
});
