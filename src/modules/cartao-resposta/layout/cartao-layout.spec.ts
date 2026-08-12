import { buildLayout } from './cartao-layout';

describe('buildLayout', () => {
  it('matrícula: 1 fieldBlock QTYPE_INT com 8 labels m1..m8', () => {
    const m = buildLayout(90);
    const mat = m.fieldBlocks.find((b) => b.key === 'matricula');
    expect(mat).toBeDefined();
    expect(mat!.fieldType).toBe('QTYPE_INT');
    expect(mat!.fieldLabels).toEqual(['m1..8']);
  });

  it('respostas: split em colunas de 30 (N=90 → 3 blocos)', () => {
    const m = buildLayout(90);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(3);
    expect(cols[0].fieldLabels).toEqual(['q1..30']);
    expect(cols[1].fieldLabels).toEqual(['q31..60']);
    expect(cols[2].fieldLabels).toEqual(['q61..90']);
    cols.forEach((c) => expect(c.fieldType).toBe('QTYPE_MCQ5'));
  });

  it('N não múltiplo da coluna: último bloco parcial (N=75 → 30/30/15)', () => {
    const m = buildLayout(75);
    const cols = m.fieldBlocks.filter((b) => b.key.startsWith('respostas_c'));
    expect(cols).toHaveLength(3);
    expect(cols[2].fieldLabels).toEqual(['q61..75']);
  });

  it('4 markers nos cantos', () => {
    const m = buildLayout(90);
    expect(m.markers).toHaveLength(4);
  });

  it('bubbleCenter matrícula: origin + (i·labelsGap, j·bubblesGap)', () => {
    const m = buildLayout(90);
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
