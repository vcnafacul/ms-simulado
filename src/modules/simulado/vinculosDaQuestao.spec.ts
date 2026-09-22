import { vinculosDaQuestao } from './vinculosDaQuestao';

const materia = (id: string, nome: string) => ({ _id: id, nome }) as any;
const frente = (id: string, nome: string, mat?: any) =>
  ({ _id: id, nome, materia: mat }) as any;

const HISTORIA = materia('m-hist', 'História');
const SOCIOLOGIA = materia('m-soc', 'Sociologia');

const questao = (over: any = {}) =>
  ({
    _id: 'q1',
    materia: HISTORIA,
    frente1: frente('f-rep', 'República', HISTORIA),
    ...over,
  }) as any;

describe('vinculosDaQuestao (card 14)', () => {
  it('questão de uma frente só devolve um vínculo', () => {
    const v = vinculosDaQuestao(questao());

    expect(v).toHaveLength(1);
    expect(v[0].frente.nome).toBe('República');
    expect(v[0].materia.nome).toBe('História');
  });

  it('⚠️ questão interdisciplinar devolve os DOIS vínculos', () => {
    // O bug: `frente2` era descartada. 1.413 das 2.640 questões de homol têm
    // uma, e o drill-down por frente subcontava todas elas.
    const v = vinculosDaQuestao(
      questao({ frente2: frente('f-cid', 'Cidadania', SOCIOLOGIA) }),
    );

    expect(v.map((x) => x.frente.nome)).toEqual(['República', 'Cidadania']);
  });

  it('⚠️ a matéria vem da FRENTE, não da questão', () => {
    // Uma frente de Sociologia numa questão de História mora sob Sociologia:
    // pô-la sob História faria o drill-down mostrar "História › Sociologia",
    // que é falso. É isto que impede consertar a frente sem decidir a matéria.
    const v = vinculosDaQuestao(
      questao({ frente2: frente('f-cid', 'Cidadania', SOCIOLOGIA) }),
    );

    expect(v[1].materia.nome).toBe('Sociologia');
  });

  it('as três frentes entram', () => {
    const v = vinculosDaQuestao(
      questao({
        frente2: frente('f-cid', 'Cidadania', SOCIOLOGIA),
        frente3: frente('f-geo', 'Geopolítica', materia('m-geo', 'Geografia')),
      }),
    );

    expect(v).toHaveLength(3);
  });

  describe('⚠️ o dado sujo que a base tem de verdade', () => {
    it('`frente2: ""` não vira frente fantasma', () => {
      // MEDIDO: 125 das 1.413 questões com frente secundária guardam STRING
      // VAZIA no lugar do id. Ela passa por `!= null` e por `$ne: null` — só
      // não passa por um teste de forma.
      const v = vinculosDaQuestao(questao({ frente2: '' }));

      expect(v).toHaveLength(1);
    });

    it.each([null, undefined, '', 0, {}])(
      'frente2 = %p não gera vínculo',
      (lixo) => {
        expect(vinculosDaQuestao(questao({ frente2: lixo }))).toHaveLength(1);
      },
    );

    it('⚠️ o MESMO par não conta duas vezes', () => {
      // `frente1 === frente2` faria a questão pesar duplo na mesma conta.
      const f = frente('f-rep', 'República', HISTORIA);
      const v = vinculosDaQuestao(questao({ frente1: f, frente2: f }));

      expect(v).toHaveLength(1);
    });

    it('a mesma FRENTE em matérias diferentes conta as duas vezes', () => {
      // Não é o mesmo par: é a mesma frente vinculada a duas matérias, e cada
      // uma é uma conta separada.
      const v = vinculosDaQuestao(
        questao({
          frente1: frente('f-x', 'X', HISTORIA),
          frente2: frente('f-x', 'X', SOCIOLOGIA),
        }),
      );

      expect(v).toHaveLength(2);
    });
  });

  it('⚠️ frente sem matéria populada cai para a matéria da QUESTÃO', () => {
    // É o comportamento antigo, e é melhor que descartar o vínculo em
    // silêncio: sem o populate aninhado, a nota apareceria sob a matéria certa
    // na maioria dos casos em vez de sumir.
    const v = vinculosDaQuestao(
      questao({ frente2: frente('f-cid', 'Cidadania', undefined) }),
    );

    expect(v[1].materia.nome).toBe('História');
  });

  it('questão sem frente nenhuma não estoura', () => {
    expect(
      vinculosDaQuestao(questao({ frente1: null, frente2: null })),
    ).toEqual([]);
  });
});

/**
 * As formas que o campo assume na base REAL de homologação, e o que o Mongoose
 * entrega em cada uma — ambos medidos, não presumidos.
 *
 * | no banco              | quantas | chega como   |
 * |-----------------------|---------|--------------|
 * | id como string        | 1.288   | **populada** |
 * | `null`                | 2.633   | `null`       |
 * | string vazia `""`     | 125     | `undefined`  |
 * | campo ausente         | 7       | `undefined`  |
 *
 * Rodar `vinculosDaQuestao` contra as **2.640 questões reais** deu **zero
 * erros** — 1.350 com um vínculo, 960 com dois, 328 com três e 2 sem nenhum.
 */
describe('vinculosDaQuestao — as formas REAIS da base (card 14)', () => {
  const MAT = { _id: 'm1', nome: 'Matemática' } as any;
  const F1 = { _id: 'f1', nome: 'Aritmética', materia: MAT } as any;

  const q = (over: any = {}) =>
    ({ _id: 'q', materia: MAT, frente1: F1, ...over }) as any;

  it.each([
    ['null — 2.633 questões', null],
    ['undefined (string vazia, que o cast converte) — 125', undefined],
    ['undefined (campo ausente) — 7', undefined],
  ])('frente2 = %s não gera vínculo nem erro', (_nome, valor) => {
    expect(() => vinculosDaQuestao(q({ frente2: valor }))).not.toThrow();
    expect(vinculosDaQuestao(q({ frente2: valor }))).toHaveLength(1);
  });

  it('⚠️ frente que NÃO foi populada (chega como string) é rejeitada', () => {
    // Os ids estão gravados como STRING na base (`objectId: 0` na coleção
    // inteira). O populate só resolve porque o schema declara
    // `type: Types.ObjectId` e o Mongoose faz o cast. Se esse tipo sumir, o
    // campo chega como string crua — e um `f !== null` a trataria como frente,
    // produzindo `f.nome === undefined` no drill-down.
    const v = vinculosDaQuestao(q({ frente2: '64cae70a573a2b3d03e58dfa' }));

    expect(v).toHaveLength(1);
  });

  it('⚠️ ObjectId cru (populate que não resolveu) também é rejeitado', () => {
    // Um ObjectId é `typeof "object"` e passaria por um teste de nulidade —
    // mas não tem `_id`, e viraria uma frente sem nome na tela.
    const objectIdCru = { toString: () => 'f2', buffer: new Uint8Array(12) };
    const v = vinculosDaQuestao(q({ frente2: objectIdCru }));

    expect(v).toHaveLength(1);
  });

  it('⚠️ questão com `frente1: null` devolve [] — e NÃO estoura', () => {
    // São 2 questões reais em homol. O cálculo ANTIGO fazia
    // `res.frente._id.toString()` nelas: TypeError, `processAnswer` no catch, e
    // o cartão inteiro marcado como `erro_no_processamento`.
    expect(() =>
      vinculosDaQuestao(q({ frente1: null, frente2: null, frente3: null })),
    ).not.toThrow();
    expect(
      vinculosDaQuestao(q({ frente1: null, frente2: null, frente3: null })),
    ).toEqual([]);
  });

  it('as três frentes populadas dão três vínculos — o caso de 328 questões', () => {
    const v = vinculosDaQuestao(
      q({
        frente2: { _id: 'f2', nome: 'Gramática', materia: MAT },
        frente3: { _id: 'f3', nome: 'Leitura', materia: MAT },
      }),
    );

    expect(v).toHaveLength(3);
  });
});
