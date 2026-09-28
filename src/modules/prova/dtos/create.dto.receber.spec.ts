import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateProvaDTOInput } from './create.dto.input';

/** tickets/023, card 05 — o multipart da api pode mandar string. */
describe('CreateProvaDTOInput.receberNovasVersoes', () => {
  const dto = (receberNovasVersoes?: unknown) =>
    plainToInstance(CreateProvaDTOInput, {
      edicao: 'Regular',
      aplicacao: 1,
      ano: 2024,
      categoria: 'x',
      criadorId: 'u',
      receberNovasVersoes,
    });
  const erros = (d: CreateProvaDTOInput) =>
    validateSync(d).filter((e) => e.property === 'receberNovasVersoes');

  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('%p → %p', (entrada, saida) => {
    const d = dto(entrada);
    expect(d.receberNovasVersoes).toBe(saida);
    expect(erros(d)).toHaveLength(0);
  });

  it('ausente é válido (vira false na prova)', () => {
    expect(erros(dto(undefined))).toHaveLength(0);
  });

  it('lixo é recusado', () => {
    expect(erros(dto('sim'))).not.toHaveLength(0);
  });
});
