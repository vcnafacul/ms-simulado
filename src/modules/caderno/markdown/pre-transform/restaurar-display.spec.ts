import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { EH_DISPLAY, restaurarDisplay } from './restaurar-display';
import { visitar } from './visitar';

const parse = (md: string): any =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(md);

/** Devolve [valor, éDisplay] de cada nó de matemática, na ordem. */
function matematicas(md: string): [string, boolean][] {
  const arvore = parse(md);
  restaurarDisplay(arvore, md);
  const achados: [string, boolean][] = [];
  visitar(arvore, (no: any) => {
    if (no.type === 'inlineMath' || no.type === 'math') {
      achados.push([no.value, no.data?.[EH_DISPLAY] === true]);
    }
  });
  return achados;
}

describe('restaurarDisplay', () => {
  it('marca como display o que veio com $$', () => {
    // O editor grava display como $$formula$$ numa linha só, e o remark-math
    // só produz nó display com delimitador em linha própria — então tudo
    // chega como inlineMath e a distinção se perde.
    expect(matematicas('$$\\int_0^1 x\\,dx$$')).toEqual([
      ['\\int_0^1 x\\,dx', true],
    ]);
  });

  it('não marca o que veio com um cifrão só', () => {
    expect(matematicas('A função $f(x)=x^2$ é par.')).toEqual([
      ['f(x)=x^2', false],
    ]);
  });

  it('distingue os dois no mesmo parágrafo', () => {
    expect(matematicas('Temos $a^2$ e também $$b^2$$ aqui.')).toEqual([
      ['a^2', false],
      ['b^2', true],
    ]);
  });

  it('não quebra quando não há matemática nenhuma', () => {
    expect(matematicas('Texto comum, sem fórmula.')).toEqual([]);
  });

  it('usa os offsets da fonte que foi parseada, não de outra', () => {
    // Se alguém reordenar o pipeline e passar o markdown ORIGINAL aqui
    // depois de o parser ter recebido o neutralizado, os offsets ficam
    // deslocados e o display some sem erro. Este teste fixa o contrato.
    const md = '$$b^2$$';
    const arvore = parse(md);
    restaurarDisplay(arvore, 'xx' + md); // fonte deslocada de propósito

    const achados: boolean[] = [];
    visitar(arvore, (no: any) => {
      if (no.type === 'inlineMath')
        achados.push(no.data?.[EH_DISPLAY] === true);
    });
    expect(achados).toEqual([false]);
  });
});
