import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { Paragraph, Root } from 'mdast';

/**
 * A stack do remark é ESM-only (`"type": "module"`) e este projeto é CommonJS.
 * Em produção funciona porque o Node 20.19 retroportou `require(esm)` — que é
 * no que o TS transforma estes `import` estáticos.
 *
 * ⚠️ Estes testes **não** exercitam o `require(esm)` do Node. Sob Jest, o
 * `transformIgnorePatterns` faz o ts-jest transpilar a stack ESM para
 * CommonJS antes que ela chegue aqui — de propósito, porque o `jest-runtime`
 * tem loader próprio e ignora o backport do Node. Quem exercita o
 * `require(esm)` é só a produção. O único guarda real do piso é o teste da
 * versão em execução, logo abaixo.
 */
describe('stack do remark sob CommonJS', () => {
  it('carrega de forma síncrona, sem async', () => {
    expect(typeof unified).toBe('function');
  });

  it('parseia math inline e tabela GFM', () => {
    const arvore = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .parse('Com $x^2$ e:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n') as Root;

    expect(arvore.children.map((n) => n.type)).toEqual(['paragraph', 'table']);
    expect(
      (arvore.children[0] as Paragraph).children.map((n) => n.type),
    ).toContain('inlineMath');
  });

  it('roda num Node que suporta require(esm)', () => {
    // Este é o único guarda real do piso: em produção a stack ESM é carregada
    // pelo require(esm) do Node, que só existe a partir do 20.19. Aqui no Jest
    // ela vem transpilada, então quem falha num Node velho é este teste — não
    // o import.
    const [maior, menor] = process.versions.node.split('.').map(Number);
    expect(maior > 20 || (maior === 20 && menor >= 19)).toBe(true);
  });
});
