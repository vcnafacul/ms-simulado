import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConsultarRelatorioDtoInput } from './consultar-relatorio.dto.input';

const validar = (query: unknown) =>
  validateSync(plainToInstance(ConsultarRelatorioDtoInput, query) as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

describe('ConsultarRelatorioDtoInput', () => {
  it('aceita só o cursinho', () => {
    expect(validar({ cursinhoId: 'cur-1' })).toHaveLength(0);
  });

  it('aceita cursinho e turma', () => {
    expect(validar({ cursinhoId: 'cur-1', turmaId: 't-1' })).toHaveLength(0);
  });

  it('RECUSA sem cursinhoId — senão a rota viraria "todos os cursinhos"', () => {
    expect(validar({}).length).toBeGreaterThan(0);
    expect(validar({ turmaId: 't-1' }).length).toBeGreaterThan(0);
  });

  it('recusa cursinhoId vazio', () => {
    expect(validar({ cursinhoId: '' }).length).toBeGreaterThan(0);
  });
});
