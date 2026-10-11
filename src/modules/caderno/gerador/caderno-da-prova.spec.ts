import { model, Types } from 'mongoose';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { montarCadernoDaProva } from './caderno-da-prova';

/**
 * tickets/038 (card 09) — com DOCUMENTOS do Mongoose, como chegam do banco.
 *
 * ⚠️ O teste do serviço usava objetos simples e passava; em produção os simulados são
 * documentos, e `{ ...qc }` num subdocumento não copia `numero` nem `questao`: o caderno da
 * prova saía com "[Este simulado não tem nenhuma questão elegível…]".
 */
describe('montarCadernoDaProva com documentos do banco', () => {
  const Modelo = model<Simulado>('SimuladoCadernoDaProvaSpec', SimuladoSchema);
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

  it('o título de bloco só nas questões de língua', () => {
    expect(r.questoes.map((q) => q.secao)).toEqual([
      'Língua estrangeira — Inglês',
      'Língua estrangeira — Inglês',
      'Língua estrangeira — Espanhol',
      'Língua estrangeira — Espanhol',
      null,
      null,
    ]);
  });
});
