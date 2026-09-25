import { calcularAproveitamento } from './calcularAproveitamento';

const materia = (nome: string) => ({ _id: `m-${nome}`, nome });
const frente = (nome: string, m: string) => ({
  _id: `f-${nome}`,
  nome,
  materia: materia(m),
});

const resposta = (
  frentes: ReturnType<typeof frente>[],
  acertou: boolean,
): any => {
  const questao: any = { materia: frentes[0]?.materia };
  frentes.forEach((f, i) => (questao[`frente${i + 1}`] = f));
  return {
    questao,
    alternativaEstudante: acertou ? 'A' : 'B',
    alternativaCorreta: 'A',
  };
};

describe('calcularAproveitamento (contagem-por-materia 01)', () => {
  it('⚠️ interdisciplinar continua contando em CADA matéria — uma vez em cada', () => {
    const ap = calcularAproveitamento([
      resposta(
        [
          frente('Brasil', 'História'),
          frente('Colônia', 'História'),
          frente('Trabalho', 'Sociologia'),
        ],
        true,
      ),
    ]);

    const questoes = Object.fromEntries(
      ap.materias.map((m) => [m.nome, m.questoes]),
    );
    expect(questoes).toEqual({ História: 1, Sociologia: 1 });
    expect(ap.geral).toBe(1);
  });

  it('frente repetida na mesma questão (dado sujo) não conta duas vezes', () => {
    const f = frente('Álgebra', 'Matemática');
    const ap = calcularAproveitamento([resposta([f, f], false)]);

    expect(ap.materias[0].questoes).toBe(1);
    expect(ap.materias[0].frentes[0].questoes).toBe(1);
  });

  it('geral segue sobre as respostas, não sobre os vínculos', () => {
    const ap = calcularAproveitamento([
      resposta(
        [frente('Álgebra', 'Matemática'), frente('Trabalho', 'Sociologia')],
        true,
      ),
      resposta([frente('Álgebra', 'Matemática')], false),
    ]);

    expect(ap.geral).toBe(0.5);
  });
});
