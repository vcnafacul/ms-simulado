import { buildLayout, DEFAULT_CONFIG } from './cartao-layout';

describe('buildLayout', () => {
  it('matrícula: 1 fieldBlock QTYPE_INT com 8 labels m1..m8 (quando incluirMatricula)', () => {
    const m = buildLayout(90, { ...DEFAULT_CONFIG, incluirMatricula: true });
    const mat = m.fieldBlocks.find((b) => b.key === 'matricula');
    expect(mat).toBeDefined();
    expect(mat!.fieldType).toBe('QTYPE_INT');
    expect(mat!.fieldLabels).toEqual(['m1..8']);
  });

  it('matrícula: DEFAULT_CONFIG NÃO inclui o fieldBlock de matrícula', () => {
    const m = buildLayout(90);
    expect(m.fieldBlocks.find((b) => b.key === 'matricula')).toBeUndefined();
  });

  it('respostas: N=90 → 5 colunas de 18 (q1..18 … q73..90)', () => {
    const m = buildLayout(90);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(5);
    expect(cols[0].fieldLabels).toEqual(['q1..18']);
    expect(cols[1].fieldLabels).toEqual(['q19..36']);
    expect(cols[2].fieldLabels).toEqual(['q37..54']);
    expect(cols[3].fieldLabels).toEqual(['q55..72']);
    expect(cols[4].fieldLabels).toEqual(['q73..90']);
    cols.forEach((c) => expect(c.fieldType).toBe('QTYPE_MCQ5'));
  });

  it('auto-fit balanceado: N=45 → 3 colunas 15/15/15', () => {
    const m = buildLayout(45);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(3);
    expect(cols[0].fieldLabels).toEqual(['q1..15']);
    expect(cols[1].fieldLabels).toEqual(['q16..30']);
    expect(cols[2].fieldLabels).toEqual(['q31..45']);
  });

  it('startNumero desloca os rótulos (bloco 46..90): N=45, start=46 → q46..60, q61..75, q76..90', () => {
    const m = buildLayout(45, DEFAULT_CONFIG, 46);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(3);
    expect(cols[0].fieldLabels).toEqual(['q46..60']);
    expect(cols[1].fieldLabels).toEqual(['q61..75']);
    expect(cols[2].fieldLabels).toEqual(['q76..90']);
  });

  it('auto-fit balanceado: N=75 → 5 colunas 15/15/15/15/15', () => {
    const m = buildLayout(75);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(5);
    expect(cols[0].fieldLabels).toEqual(['q1..15']);
    expect(cols[1].fieldLabels).toEqual(['q16..30']);
    expect(cols[2].fieldLabels).toEqual(['q31..45']);
    expect(cols[3].fieldLabels).toEqual(['q46..60']);
    expect(cols[4].fieldLabels).toEqual(['q61..75']);
  });

  it('N pequeno: N=20 → 2 colunas (q1..10, q11..20)', () => {
    const m = buildLayout(20);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(2);
    expect(cols[0].fieldLabels).toEqual(['q1..10']);
    expect(cols[1].fieldLabels).toEqual(['q11..20']);
  });

  it('respostasEvenColumns: margem esq = vãos entre containers = margem dir (na caixa dos markers)', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      respostasEvenColumns: true,
      maxQuestionsPerColumn: 18,
      bubbleWidthPx: 46,
      respostasBubblesGap: 66,
    };
    const m = buildLayout(90, cfg);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(5);

    // Os containers são distribuídos DENTRO da caixa dos markers (de `near` a pageWidth−near),
    // então as margens são medidas a partir do marker, não da borda da página.
    const near = cfg.markerInsetPx + cfg.markerSizePx / 2;
    const boxLeft = near;
    const boxRight = cfg.pageWidthPx - near;
    const leftEdge = (b: (typeof cols)[number]) =>
      b.origin[0] -
      cfg.bubbleWidthPx / 2 -
      cfg.respostasNumberWidthPx -
      cfg.respostasBoxPadPx;
    const rightEdge = (b: (typeof cols)[number]) =>
      b.origin[0] +
      4 * cfg.respostasBubblesGap +
      cfg.bubbleWidthPx / 2 +
      cfg.respostasBoxPadPx;

    const marginLeft = leftEdge(cols[0]) - boxLeft;
    const marginRight = boxRight - rightEdge(cols[cols.length - 1]);
    const gutters = cols
      .slice(1)
      .map((b, i) => leftEdge(b) - rightEdge(cols[i]));

    // tolerância de 1px (arredondamento das origens pra inteiro)
    gutters.forEach((g) =>
      expect(Math.abs(g - marginLeft)).toBeLessThanOrEqual(1),
    );
    expect(Math.abs(marginRight - marginLeft)).toBeLessThanOrEqual(1);
    // e tudo cabe dentro da caixa dos markers
    expect(leftEdge(cols[0])).toBeGreaterThanOrEqual(boxLeft);
    expect(rightEdge(cols[cols.length - 1])).toBeLessThanOrEqual(boxRight);
  });

  it('4 markers nos cantos', () => {
    const m = buildLayout(90);
    expect(m.markers).toHaveLength(4);
  });

  it('bubbleCenter matrícula: origin + (i·labelsGap, j·bubblesGap)', () => {
    const m = buildLayout(90, { ...DEFAULT_CONFIG, incluirMatricula: true });
    const mat = m.fieldBlocks.find((b) => b.key === 'matricula')!;
    const c = m.bubbleCenter('matricula', 2, 3);
    expect(c.x).toBe(mat.origin[0] + 2 * mat.labelsGap);
    expect(c.y).toBe(mat.origin[1] + 3 * mat.bubblesGap);
  });

  it('bubbleCenter respostas: origin + (o·bubblesGap, qLocal·labelsGap)', () => {
    const m = buildLayout(90);
    const c1 = m.fieldBlocks.find((b) => b.key === 'respostas_c1')!;
    const c = m.bubbleCenter('respostas_c1', 4, 2);
    expect(c.x).toBe(c1.origin[0] + 2 * c1.bubblesGap);
    expect(c.y).toBe(c1.origin[1] + 4 * c1.labelsGap);
  });
});
