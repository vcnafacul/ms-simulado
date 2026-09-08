import { Status } from '../../questao/enums/status.enum';
import { gerarCaderno } from './gerar-caderno';
import { QuestaoParaCaderno, SimuladoParaCaderno } from './tipos';

/**
 * Um simulado que exercita, num arquivo só, tudo o que o gerador decide:
 * numeração real do ENEM, imagem externa (o caso dominante do acervo), imagem
 * do nosso R2, largura em px, div de alinhamento, matemática, `%` no texto,
 * markdown que fica literal, alternativa em branco e imagem recusada.
 */
export const SIMULADO: SimuladoParaCaderno = {
  nome: 'Simulado 100% ENEM — 1º dia',
  categoria: { nome: 'ENEM 1º dia', duracao: 300, quantidadeTotalQuestao: 3 },
  questoes: [
    {
      numero: 47,
      questao: {
        status: Status.Approved,
        textoQuestao:
          '![](https://enem.dev/2016/questions/3/812288c1-3e37-4369-914a-057525abd52e.png)Os moradores de Andalsnes, na Noruega, poderiam se dar ao luxo de morar perto do trabalho.',
        pergunta: 'O texto trata de:',
        textoAlternativaA: 'Mobilidade urbana',
        textoAlternativaB: 'Arquitetura **modular**',
        textoAlternativaC: 'Turismo de inverno',
        textoAlternativaD: 'Custo de R$ 1.200,00 por mês',
        textoAlternativaE: 'Nenhuma das anteriores',
      },
    },
    {
      numero: 46,
      questao: {
        status: Status.Approved,
        textoQuestao:
          'Considere a função $f(x) = x^2 - 4$, que representa 100% do fenômeno.',
        pergunta: 'As raízes de $f$ são:',
        textoAlternativaA: '$x = 0$ e $x = 4$',
        textoAlternativaB: '$x = -2$ e $x = 2$',
        textoAlternativaC: '',
        textoAlternativaD: '$x \\in \\emptyset$',
        textoAlternativaE: '$x = 1$ e $x = -1$',
      },
    },
    {
      numero: 48,
      questao: {
        status: Status.Approved,
        textoQuestao:
          '<div style="text-align: center"><img src="asset://assets/a02398bc-1d10-48ad-b41f-d4296faf0fe7.jpeg" alt="" width="320" height="200" /></div>',
        pergunta: 'A imagem mostra:',
        textoAlternativaA: 'Um mapa',
        textoAlternativaB: '![](ftp://arquivo.antigo/grafico.png)',
        textoAlternativaC: 'Uma fotografia',
        textoAlternativaD: 'Um gráfico',
        textoAlternativaE: 'Uma tabela',
      },
    },
  ],
};

describe('gerarCaderno — snapshot', () => {
  it('conteudo.tex do fixture completo', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).conteudo).toMatchSnapshot();
  });

  it('metadados.tex do fixture completo', () => {
    expect(
      gerarCaderno(SIMULADO, { draft: false }).metadados,
    ).toMatchSnapshot();
  });

  it('metadados.tex no modo rascunho', () => {
    expect(gerarCaderno(SIMULADO, { draft: true }).metadados).toMatchSnapshot();
  });

  it('as imagens coletadas', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).imagens).toMatchSnapshot();
  });
});

describe('gerarCaderno — o gabarito não existe no tipo', () => {
  it('QuestaoParaCaderno não aceita `alternativa`', () => {
    // Garantia de compilador, não de disciplina: se alguém acrescentar o campo
    // ao tipo, este teste para de compilar, e o motivo está no docblock de
    // QuestaoParaCaderno.
    //
    // ⚠️ Precisa ser um objeto literal ATRIBUÍDO DIRETO ao tipo. TypeScript só
    // reclama de propriedade extra em literal; passando por uma variável
    // intermediária a tipagem estrutural aceita o campo a mais, e a diretiva
    // de erro esperado abaixo vira "unused" — o teste falha por outro motivo.
    // (Nota: por isso esta explicação evita escrever a diretiva por extenso
    // no início de uma linha de comentário — o compilador não distingue.)
    const q: QuestaoParaCaderno = {
      status: Status.Approved,
      textoQuestao: 'Enunciado.',
      // @ts-expect-error `alternativa` não pertence a QuestaoParaCaderno
      alternativa: 'B',
    };
    expect(q).toBeDefined();
  });
});
