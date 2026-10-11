import { model } from 'mongoose';
import { Idioma } from '../enums/idioma.enum';
import { Simulado, SimuladoSchema } from './simulado.schema';

/**
 * tickets/038 — `idioma` com `default: null`. ⚠️ Sem o `null` no `enum`, o
 * Mongoose recusa todo create que não informa o campo (todo simulado que não é
 * da ENEM do cursinho).
 */
describe('Simulado.idioma', () => {
  const Model = model<Simulado>('SimuladoIdiomaSpec', SimuladoSchema);

  it('sem o campo: valida e fica null', () => {
    const doc = new Model({ nome: 'S' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.idioma).toBeNull();
  });

  it.each(Object.values(Idioma))('aceita %s', (idioma) => {
    expect(new Model({ nome: 'S', idioma }).validateSync()).toBeUndefined();
  });

  it('recusa outro valor', () => {
    expect(
      new Model({ nome: 'S', idioma: 'Francês' }).validateSync(),
    ).toBeDefined();
  });
});
