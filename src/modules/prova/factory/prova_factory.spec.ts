import { ProvaFactory } from './prova_factory';
import { CustomProvaFactory } from './custom_prova_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';
import { Enem2010_2017Factory } from './enem_2010_2016_factory';
import { Categoria } from 'src/modules/categoria/schemas/categoria.schema';

function makeDispatcher() {
  return new ProvaFactory(
    {} as any, // categoriaRepository
    {} as any, // questaoRepository
    {} as any, // provaRepository
    {} as any, // frenteRepository
    {} as any, // simuladoService
    {} as any, // simuladoRepository
    {} as any, // enemService
  );
}

describe('ProvaFactory.getFactory', () => {
  it('roteia para CustomProvaFactory quando categoria.custom === true', () => {
    const dispatcher = makeDispatcher();
    const categoria = { custom: true, exame: { nome: 'Personalizado' } } as unknown as Categoria;
    expect(dispatcher.getFactory(categoria, 2024)).toBeInstanceOf(
      CustomProvaFactory,
    );
  });

  it('roteia para Enem2017PlusFactory quando ENEM e ano > 2016', () => {
    const dispatcher = makeDispatcher();
    const categoria = { custom: false, exame: { nome: 'ENEM' } } as unknown as Categoria;
    expect(dispatcher.getFactory(categoria, 2020)).toBeInstanceOf(
      Enem2017PlusFactory,
    );
  });

  it('roteia para Enem2010_2017Factory quando ENEM e 2010 <= ano <= 2016', () => {
    const dispatcher = makeDispatcher();
    const categoria = { custom: false, exame: { nome: 'ENEM' } } as unknown as Categoria;
    expect(dispatcher.getFactory(categoria, 2015)).toBeInstanceOf(
      Enem2010_2017Factory,
    );
  });

  it('lança erro quando não há factory para o exame/ano', () => {
    const dispatcher = makeDispatcher();
    const categoria = { custom: false, exame: { nome: 'OUTRO' } } as unknown as Categoria;
    expect(() => dispatcher.getFactory(categoria, 2020)).toThrow();
  });
});
