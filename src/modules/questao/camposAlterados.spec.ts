import {
  CAMPOS_DE_CONTEUDO,
  camposAlterados,
  registroDaEdicao,
} from './camposAlterados';

describe('camposAlterados (card 24)', () => {
  const campos = ['a', 'b'] as const;

  it('devolve só o que mudou', () => {
    expect(camposAlterados({ a: 1, b: 2 }, { a: 9, b: 2 }, campos)).toEqual([
      'a',
    ]);
  });

  it('⚠️ save que não altera nada devolve lista vazia', () => {
    /*
      É o ponto do card: um save idêntico não é edição, e contá-lo inflaria o
      número que o card 26 vai usar para decidir se o versionamento se paga.
    */
    expect(camposAlterados({ a: 1, b: 2 }, { a: 1, b: 2 }, campos)).toEqual([]);
  });

  it('⚠️ campo AUSENTE no payload não conta como mudança', () => {
    /*
      Ausente é "não mexer". Tratá-lo como mudança para `undefined` marcaria
      toda edição parcial como alteração de tudo.
    */
    expect(camposAlterados({ a: 1, b: 2 }, { a: 1 }, campos)).toEqual([]);
  });

  it('⚠️ `null` e `undefined` são o MESMO vazio', () => {
    /*
      O Mongo grava campo ausente e `null` de formas diferentes (medido no card
      14). Uma questão legada sem `pergunta` recebendo `pergunta: null` não é
      edição — é o mesmo vazio escrito de outro jeito.
    */
    expect(camposAlterados({ a: null }, { a: undefined }, ['a'])).toEqual([]);
    expect(camposAlterados({}, { a: null }, ['a'])).toEqual([]);
  });

  it('vazio virando texto É mudança', () => {
    expect(camposAlterados({ a: null }, { a: 'x' }, ['a'])).toEqual(['a']);
  });

  it('preserva a ordem da lista de campos, não a do payload', () => {
    expect(camposAlterados({ a: 1, b: 1 }, { b: 9, a: 9 }, campos)).toEqual([
      'a',
      'b',
    ]);
  });

  it('⚠️ o gabarito está entre os campos de conteúdo', () => {
    // Trocar `alternativa` muda quem acertou — é o caso mais grave, e o card 28
    // (recorreção) nasce dele.
    expect(CAMPOS_DE_CONTEUDO).toContain('alternativa');
  });
});

describe('registroDaEdicao', () => {
  it('⚠️ grava os NOMES dos campos, nunca o conteúdo', () => {
    /*
      Gravar o texto antigo aqui seria versionamento pela porta dos fundos —
      com todas as decisões do card 26 tomadas por omissão. Este card mede;
      quem guarda é o 26.
    */
    const r = JSON.parse(
      registroDaEdicao('updateContent', ['textoQuestao'], 3),
    );

    expect(r).toEqual({
      acao: 'updateContent',
      campos: ['textoQuestao'],
      respondida: true,
    });
  });

  it('⚠️ `respondida` é o campo que responde a pergunta do card', () => {
    // Editar questão que ninguém respondeu é inofensivo — é rascunho. O que
    // interessa é quantas edições atingem questão JÁ respondida.
    expect(JSON.parse(registroDaEdicao('x', [], 0)).respondida).toBe(false);
    expect(JSON.parse(registroDaEdicao('x', [], undefined)).respondida).toBe(
      false,
    );
    expect(JSON.parse(registroDaEdicao('x', [], 1)).respondida).toBe(true);
  });
});
