import { Status } from '../../questao/enums/status.enum';

import { SimuladoParaCaderno } from './tipos';

/**
 * Fixture do caderno — **dado de teste, não código de produção.**
 *
 * Mora fora do `.spec.ts` por um motivo prático: o gate manual do Overleaf usa
 * um script avulso, rodado com `ts-node`, e importar de um arquivo de teste
 * arrastaria o `describe` do Jest para fora do Jest. A alternativa seria o
 * script ter a própria cópia do fixture — e aí o pacote que se compila no
 * Overleaf deixaria de ser o mesmo que o snapshot congela, que é justamente o
 * que o gate existe para conferir.
 *
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
