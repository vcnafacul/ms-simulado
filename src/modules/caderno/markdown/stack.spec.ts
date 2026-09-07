import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/**
 * A stack do remark é ESM-only (`"type": "module"`) e este projeto é CommonJS.
 * Funciona porque o Node 20.19 retroportou `require(esm)` — que é no que o TS
 * transforma estes `import` estáticos.
 *
 * Este teste é a rede de segurança do piso de Node: num Node anterior a 20.19
 * ele falha aqui, no import, alto e imediato, em vez de o serviço quebrar no
 * boot em produção.
 *
 * O Jest não usa o `require(esm)` do Node: o `jest-runtime` tem loader
 * CommonJS próprio e tenta executar o fonte ESM como CJS, dando
 * `SyntaxError: Unexpected token 'export'`. Por isso o `package.json` manda
 * o ts-jest transformar esses pacotes do `node_modules` via
 * `tsconfig.jest.json` (que só acrescenta `allowJs`). Em produção nada disso
 * é usado — lá o `require(esm)` do Node ≥20.19 resolve sozinho.
 */
describe('stack do remark sob CommonJS', () => {
  it('carrega de forma síncrona, sem async', () => {
    expect(typeof unified).toBe('function');
  });

  it('parseia math inline e tabela GFM', () => {
    const arvore: any = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .parse('Com $x^2$ e:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');

    expect(arvore.children.map((n: any) => n.type)).toEqual([
      'paragraph',
      'table',
    ]);
    expect(arvore.children[0].children.map((n: any) => n.type)).toContain(
      'inlineMath',
    );
  });

  it('o package.json declara o piso de Node que a stack exige', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../../package.json');
    expect(pkg.engines?.node).toBe('>=20.19');
  });

  it('o jest está configurado para transformar a stack ESM', () => {
    // Sem isto o jest-runtime tenta executar o fonte ESM como CommonJS e
    // quebra com "Unexpected token 'export'". Não é sobra de configuração:
    // é o que faz qualquer spec que importe o remark rodar.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../../package.json');
    const padrao = (pkg.jest.transformIgnorePatterns ?? []).join(' ');
    expect(padrao).toContain('unified');
    expect(padrao).toContain('remark-');
    expect(JSON.stringify(pkg.jest.transform)).toContain('tsconfig.jest.json');
  });
});
