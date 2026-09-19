import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CartaoCallbackDtoInput } from './cartao-callback.dto.input';

const validar = (payload: unknown) =>
  validateSync(plainToInstance(CartaoCallbackDtoInput, payload) as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

describe('CartaoCallbackDtoInput', () => {
  it('aceita o que o ms-omr manda hoje: falha com motivo e detalhe', () => {
    expect(
      validar({
        imageKey: 'k',
        falha: { motivo: 'motor_timeout', detalhe: 'x' },
      }),
    ).toHaveLength(0);
  });

  it('aceita falha com detalhe null — é o que o ms-omr envia quando não há detalhe', () => {
    expect(
      validar({
        imageKey: 'k',
        falha: { motivo: 'motor_timeout', detalhe: null },
      }),
    ).toHaveLength(0);
  });

  it('aceita callback de sucesso, sem falha', () => {
    expect(
      validar({
        imageKey: 'k',
        respostas: [{ questao: '1', alternativaEstudante: 'A' }],
      }),
    ).toHaveLength(0);
  });

  it('recusa falha que não é objeto — um array passaria pelo ValidateNested e viraria falha sem código', () => {
    expect(validar({ imageKey: 'k', falha: [] }).length).toBeGreaterThan(0);
    expect(validar({ imageKey: 'k', falha: 'texto' }).length).toBeGreaterThan(
      0,
    );
    expect(validar({ imageKey: 'k', falha: 42 }).length).toBeGreaterThan(0);
  });

  it('recusa falha sem motivo', () => {
    expect(
      validar({ imageKey: 'k', falha: { detalhe: 'só detalhe' } }).length,
    ).toBeGreaterThan(0);
  });
});
