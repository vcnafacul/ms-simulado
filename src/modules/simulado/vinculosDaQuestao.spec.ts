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
