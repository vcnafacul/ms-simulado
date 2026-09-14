import { ProvaFactory } from './prova_factory';
import { CustomProvaFactory } from './custom_prova_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';
import { Enem2010_2017Factory } from './enem_2010_2016_factory';
import {
  Categoria,
  DONO_SYSTEM,
} from 'src/modules/categoria/schemas/categoria.schema';

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

/**
 * ⚠️ **Toda fixture precisa de `dono`.** O roteamento passou a testar
 * `categoria.dono !== DONO_SYSTEM`, e `undefined !== 'system'` é verdadeiro —
 * uma categoria sem o campo cai na `CustomProvaFactory`. Nos testes isso
 * quebrou os três casos de ENEM; em produção significa que **uma categoria
 * legada, antes do backfill da migração 0003, geraria 1 simulado no lugar dos
 * 5 do Dia 1**, sem erro nenhum. É mais um motivo de a migração vir antes do
 * deploy do ms.
 */
describe('ProvaFactory.getFactory', () => {
  it('roteia para CustomProvaFactory quando categoria.custom === true', () => {
    const dispatcher = makeDispatcher();
    const categoria = {
      custom: true,
      dono: DONO_SYSTEM,
      exame: { nome: 'Personalizado' },
    } as unknown as Categoria;
    expect(dispatcher.getFactory(categoria, 2024)).toBeInstanceOf(
      CustomProvaFactory,
    );
  });

  it('roteia para Enem2017PlusFactory quando ENEM e ano > 2016', () => {
    const dispatcher = makeDispatcher();
    const categoria = {
      custom: false,
      dono: DONO_SYSTEM,
      exame: { nome: 'ENEM' },
    } as unknown as Categoria;
    expect(dispatcher.getFactory(categoria, 2020)).toBeInstanceOf(
      Enem2017PlusFactory,
    );
  });

  it('roteia para Enem2010_2017Factory quando ENEM e 2010 <= ano <= 2016', () => {
    const dispatcher = makeDispatcher();
    const categoria = {
      custom: false,
      dono: DONO_SYSTEM,
      exame: { nome: 'ENEM' },
    } as unknown as Categoria;
    expect(dispatcher.getFactory(categoria, 2015)).toBeInstanceOf(
      Enem2010_2017Factory,
    );
  });

  it('lança erro quando não há factory para o exame/ano', () => {
    const dispatcher = makeDispatcher();
    const categoria = {
      custom: false,
      dono: DONO_SYSTEM,
      exame: { nome: 'OUTRO' },
    } as unknown as Categoria;
    expect(() => dispatcher.getFactory(categoria, 2020)).toThrow();
  });
});

describe('ProvaFactory — categoria de cursinho', () => {
  it('categoria de cursinho vai para a CustomProvaFactory mesmo com custom false', () => {
    const dispatcher = makeDispatcher();
    /**
     * ⚠️ Hoje o roteamento só olha `custom`, e funciona porque
     * `CategoriaService.add` força `custom: true`. É invariante IMPLÍCITA: um
     * endpoint de update, um seed ou uma correção manual no banco produziriam
     * uma categoria de cursinho com `custom: false` — e ela cairia na fábrica
     * do ENEM, criando 5 simulados para um cursinho que pediu 1.
     */
    const categoria = {
      custom: false,
      dono: 'cur-1',
      exame: { nome: 'ENEM' },
    } as never;

    const factory = dispatcher.getFactory(categoria, 2026);

    expect(factory).toBeInstanceOf(CustomProvaFactory);
  });

  it('categoria do sistema com exame ENEM continua na fábrica do ENEM', () => {
    const dispatcher = makeDispatcher();
    // ⚠️ O par do teste acima: a mudança não pode desviar o fluxo do admin.
    const categoria = {
      custom: false,
      dono: DONO_SYSTEM,
      exame: { nome: 'ENEM' },
    } as never;

    const factory = dispatcher.getFactory(categoria, 2026);

    expect(factory).toBeInstanceOf(Enem2017PlusFactory);
  });
});
