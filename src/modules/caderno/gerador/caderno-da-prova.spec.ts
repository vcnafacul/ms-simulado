import { model, Types } from 'mongoose';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { montarCadernoDaProva, secaoDoEnem } from './caderno-da-prova';

/**
 * tickets/038 (card 09) — com DOCUMENTOS do Mongoose, como chegam do banco.
 *
 * ⚠️ O teste do serviço usava objetos simples e passava; em produção os simulados são
 * documentos, e `{ ...qc }` num subdocumento não copia `numero` nem `questao`: o caderno da
 * prova saía com "[Este simulado não tem nenhuma questão elegível…]".
 */
const Modelo = model<Simulado>('SimuladoCadernoDaProvaSpec', SimuladoSchema);

describe('montarCadernoDaProva com documentos do banco', () => {
  const [i1, i2, e1, e2, c6, c7] = [0, 1, 2, 3, 4, 5].map(
    () => new Types.ObjectId(),
  );
  const ing = new Modelo({
    nome: 'P Inglês',
    idioma: 'Inglês',
    questoes: [
      { questao: c7, numero: 7 },
      { questao: i2, numero: 2 },
      { questao: i1, numero: 1 },
      { questao: c6, numero: 6 },
    ],
  });
  const esp = new Modelo({
    nome: 'P Espanhol',
    idioma: 'Espanhol',
    questoes: [
      { questao: e1, numero: 1 },
      { questao: c6, numero: 6 },
      { questao: e2, numero: 2 },
      { questao: c7, numero: 7 },
    ],
  });

  const r = montarCadernoDaProva(
    { nome: 'P', categoria: { nome: 'Enem Dia 1', duracao: 330 } },
    [ing, esp] as never,
  );

  it('1–2 de Inglês, 1–2 de Espanhol e as comuns, com número e questão', () => {
    expect(r.questoes.map((q) => [String(q.questao), q.numero])).toEqual([
      [String(i1), 1],
      [String(i2), 2],
      [String(e1), 1],
      [String(e2), 2],
      [String(c6), 6],
      [String(c7), 7],
    ]);
  });

  it('língua com o idioma e a faixa; as comuns com a seção do ENEM', () => {
    const ling = 'Linguagens, Códigos e suas Tecnologias — questões de 06 a 45';
    expect(r.questoes.map((q) => q.secao)).toEqual([
      'Língua estrangeira: Inglês — questões de 01 a 05',
      'Língua estrangeira: Inglês — questões de 01 a 05',
      'Língua estrangeira: Espanhol — questões de 01 a 05',
      'Língua estrangeira: Espanhol — questões de 01 a 05',
      ling,
      ling,
    ]);
  });
});

describe('secaoDoEnem — pelo número, não pela área', () => {
  it.each([
    [6, 'Linguagens, Códigos e suas Tecnologias — questões de 06 a 45'],
    [45, 'Linguagens, Códigos e suas Tecnologias — questões de 06 a 45'],
    [46, 'Ciências Humanas e suas Tecnologias — questões de 46 a 90'],
    [90, 'Ciências Humanas e suas Tecnologias — questões de 46 a 90'],
    [91, 'Ciências da Natureza e suas Tecnologias — questões de 91 a 135'],
    [135, 'Ciências da Natureza e suas Tecnologias — questões de 91 a 135'],
    [136, 'Matemática e suas Tecnologias — questões de 136 a 180'],
    [180, 'Matemática e suas Tecnologias — questões de 136 a 180'],
  ])('%i → %s', (numero, titulo) => {
    expect(secaoDoEnem(numero)).toBe(titulo);
  });

  it('fora das faixas ou sem número: sem título', () => {
    expect(secaoDoEnem(3)).toBeNull();
    expect(secaoDoEnem(181)).toBeNull();
    expect(secaoDoEnem(null)).toBeNull();
  });

  it('Dia 2 (um simulado só): Natureza e depois Matemática, em ordem numérica', () => {
    const [n91, n92, m136] = [0, 1, 2].map(() => new Types.ObjectId());
    const dia2 = new Modelo({
      nome: 'P',
      idioma: null,
      questoes: [
        { questao: m136, numero: 136 },
        { questao: n92, numero: 92 },
        { questao: n91, numero: 91 },
      ],
    });
    const d = montarCadernoDaProva(
      { nome: 'P', categoria: { nome: 'Enem Dia 2', duracao: 300 } },
      [dia2] as never,
    );
    expect(d.questoes.map((q) => [q.numero, q.secao])).toEqual([
      [91, 'Ciências da Natureza e suas Tecnologias — questões de 91 a 135'],
      [92, 'Ciências da Natureza e suas Tecnologias — questões de 91 a 135'],
      [136, 'Matemática e suas Tecnologias — questões de 136 a 180'],
    ]);
  });
});
