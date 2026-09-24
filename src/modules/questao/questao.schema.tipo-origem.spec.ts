import { model } from 'mongoose';
import { TipoOrigem } from './enums/tipo-origem.enum';
import { QuestaoSchema } from './questao.schema';

/**
 * ⚠️ Este spec existe porque o card 32 quebrou TODO cadastro de questão e
 * nenhum teste viu: `tipoOrigem` tinha `enum: ['copia', 'versao']` e
 * `default: null`, e o validador de enum do Mongoose recusa `null` — inclusive
 * o do default. Os testes do service mockam o repositório e nunca validam o
 * documento; só o `validateSync` contra o schema real pega.
 */
const Questao = model('QuestaoTipoOrigemSpec', QuestaoSchema);
const base = { enemArea: 'Matemática', alternativa: 'A' };
const erroDoTipo = (doc: Record<string, unknown>) =>
  new Questao(doc).validateSync()?.errors?.tipoOrigem;

describe('Questao.tipoOrigem — validação do schema', () => {
  it('⚠️ sem o campo (o default null) valida — é toda questão cadastrada', () => {
    expect(erroDoTipo(base)).toBeUndefined();
  });

  it('null explícito valida', () => {
    expect(erroDoTipo({ ...base, tipoOrigem: null })).toBeUndefined();
  });

  it('copia e versao validam', () => {
    expect(
      erroDoTipo({ ...base, tipoOrigem: TipoOrigem.copia }),
    ).toBeUndefined();
    expect(
      erroDoTipo({ ...base, tipoOrigem: TipoOrigem.versao }),
    ).toBeUndefined();
  });

  it('valor fora do enum continua recusado', () => {
    expect(erroDoTipo({ ...base, tipoOrigem: 'irma' })).toBeDefined();
  });
});
