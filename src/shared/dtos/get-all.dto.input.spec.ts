import { ValidationPipe } from '@nestjs/common';
import { GetAllContentDtoInput } from 'src/modules/content/dtos/get-all-content.dto.input';
import { GetAllDtoInput, LIMITE_MAXIMO } from './get-all.dto.input';

// ⚠️ O teste passa pelo ValidationPipe de proposito, com as MESMAS opcoes do
// `main.ts` (transform + whitelist). O teto so vale se ele for aplicado na
// borda HTTP -- instanciar a classe na mao com `new` nao prova nada, porque
// nesse caminho o `@Transform` do class-transformer nunca roda.
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
});

const parseQuery = (
  query: Record<string, unknown>,
  metatype: any = GetAllDtoInput,
) => pipe.transform(query, { type: 'query', metatype, data: undefined });

describe('GetAllDtoInput — teto do limit', () => {
  it('limit absurdo (999999) e cortado no teto', async () => {
    const out = await parseQuery({ limit: '999999' });
    expect(out.limit).toBe(LIMITE_MAXIMO);
    expect(LIMITE_MAXIMO).toBe(500);
  });

  it('limit=10 passa INTACTO', async () => {
    const out = await parseQuery({ limit: '10' });
    // ⚠️ '10' como STRING, nao 10. O querystring entrega string e nada aqui
    // coage: `GetAllDtoOutput` devolve esse mesmo `limit` no corpo da
    // resposta, e coagir mudaria `"limit":"10"` para `"limit":10` para todo
    // cliente do ms. Fora de escopo -- e exatamente o tipo de mudanca
    // silenciosa que este teto existe para nao causar.
    expect(out.limit).toBe('10');
  });

  it('limit=500 (o proprio teto) passa intacto — e o que partnerPrepProvas pede hoje em producao', async () => {
    const out = await parseQuery({ limit: '500' });
    expect(out.limit).toBe('500');
  });

  it('limit=501 ja e cortado', async () => {
    const out = await parseQuery({ limit: '501' });
    expect(out.limit).toBe(LIMITE_MAXIMO);
  });

  it('limit numerico (nao-string) acima do teto tambem e cortado', async () => {
    const out = await parseQuery({ limit: 10000 });
    expect(out.limit).toBe(LIMITE_MAXIMO);
  });

  it('sem limit → mantem o default 40 (o `@Transform` NAO pode apagar o inicializador)', async () => {
    const out = await parseQuery({});
    expect(out.limit).toBe(40);
    expect(out.page).toBe(1);
  });

  it('limit nao-numerico passa como antes (nada de NaN novo)', async () => {
    const out = await parseQuery({ limit: 'abc' });
    expect(out.limit).toBe('abc');
  });

  it('o teto vale tambem nas subclasses (12 controllers usam o DTO, alguns via extends)', async () => {
    const out = await parseQuery({ limit: '999999' }, GetAllContentDtoInput);
    expect(out.limit).toBe(LIMITE_MAXIMO);
  });
});
