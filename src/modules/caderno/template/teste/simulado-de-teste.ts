import { Status } from '../../../questao/enums/status.enum';
import { SimuladoParaCaderno } from '../../gerador/tipos';

/**
 * O simulado falso que alimenta o zip de teste do template.
 *
 * **É um mock de domínio, não um `.tex` pronto.** O endpoint roda o gerador de
 * verdade em cima deste objeto, então o zip de teste exercita template e
 * gerador ATUAIS, juntos. Um `conteudo.tex` estático desatualiza em silêncio —
 * foi exatamente o que aconteceu com o `templates/v1/exemplo/`, escrito quando
 * ainda existia um conversor de markdown, e aposentado no card 11.
 *
 * Os seis blocos não foram escolhidos por assunto: cada um é uma forma que
 * quebra layout numa coluna de 8 cm.
 *
 * | # | o que exercita |
 * |---|---|
 * | 46 | enunciado curto, cinco alternativas curtas — o caso fácil |
 * | 47 | dois parágrafos longos — quebra de coluna no meio da questão |
 * | 48 | fórmula inline e display, que o escaper tem de deixar passar |
 * | 49 | figura no enunciado, contra o `max width=\linewidth` |
 * | 50 | alternativas longas, uma com três linhas |
 * | 51 | alternativas vazias — o caso dominante do acervo, e a caixa cinza |
 *
 * ⚠️ **O texto é fabricado e tem de PARECER fabricado.** Um enunciado
 * plausível, protegido só pela marca d'água na diagonal, é o tipo de coisa que
 * vira PDF impresso por engano.
 *
 * ⚠️ `status: Approved` em todas: o modo rascunho filtra por ele
 * (`selecionar`, em `gerador/gerar-caderno.ts`), e uma questão pendente
 * simplesmente sumiria do zip de teste.
 */
export const SIMULADO_DE_TESTE: SimuladoParaCaderno = {
  nome: 'TEMPLATE DE TESTE — NÃO APLICAR',
  categoria: {
    nome: 'Modelo de template',
    duracao: 300,
    // ⚠️ `null` de propósito. Com um alvo numérico, o modo rascunho monta
    // `faltantes` a partir do menor número presente (`gerar-caderno.ts`,
    // 146-167): seis questões começando em 46 contra um alvo de 90 fariam o
    // zip de teste anunciar 84 pendências que não existem.
    quantidadeTotalQuestao: null,
  },
  // ⚠️ Numeradas de 46 a 51, e não de 1 a 6: é a faixa do segundo dia do ENEM,
  // onde o bug de `faltantes` do card 02 apareceu. O mock exercita a numeração
  // real, com o `\setcounter{question}` que ela obriga.
  questoes: [
    {
      numero: 46,
      questao: {
        status: Status.Approved,
        textoQuestao:
          'QUESTÃO FALSA — texto de teste do template, sem conteúdo real. ' +
          'Este bloco existe só para conferir o caso mais simples: enunciado ' +
          'de uma linha e cinco alternativas curtas.',
        pergunta: 'Qual alternativa é a alternativa de teste número três?',
        textoAlternativaA: 'Alternativa de teste 1.',
        textoAlternativaB: 'Alternativa de teste 2.',
        textoAlternativaC: 'Alternativa de teste 3.',
        textoAlternativaD: 'Alternativa de teste 4.',
        textoAlternativaE: 'Alternativa de teste 5.',
      },
    },
    {
      numero: 47,
      questao: {
        status: Status.Approved,
        textoQuestao:
          'QUESTÃO FALSA — texto de teste do template, sem conteúdo real. ' +
          'O parágrafo abaixo é enchimento repetido de propósito, para forçar ' +
          'a questão a atravessar a quebra de coluna e mostrar como o cabeçalho ' +
          'e o corpo se comportam quando isso acontece. Enchimento de teste, ' +
          'enchimento de teste, enchimento de teste, enchimento de teste, ' +
          'enchimento de teste, enchimento de teste, enchimento de teste.\n\n' +
          'Segundo parágrafo de enchimento, também sem conteúdo real, para que ' +
          'a quebra de parágrafo apareça no PDF: enchimento de teste, ' +
          'enchimento de teste, enchimento de teste, enchimento de teste, ' +
          'enchimento de teste, enchimento de teste, enchimento de teste, ' +
          'enchimento de teste, enchimento de teste, enchimento de teste.',
        pergunta:
          'Os dois parágrafos acima couberam na mesma coluna, ou a questão ' +
          'quebrou no meio?',
        textoAlternativaA: 'Coube inteira na coluna.',
        textoAlternativaB: 'Quebrou depois do primeiro parágrafo.',
        textoAlternativaC: 'Quebrou no meio do segundo parágrafo.',
        textoAlternativaD: 'Quebrou entre a pergunta e as alternativas.',
        textoAlternativaE: 'Quebrou no meio das alternativas.',
      },
    },
    {
      numero: 48,
      questao: {
        status: Status.Approved,
        // ⚠️ Sem espaço depois do `$$`: `delimitadorQueAbre` recusa cifrão
        // seguido de espaço, porque `custa $ 50` é dinheiro, não fórmula.
        textoQuestao:
          'QUESTÃO FALSA — texto de teste do template, sem conteúdo real. ' +
          'Serve para conferir que a matemática atravessa o escaper intacta. ' +
          'Fórmula no meio da frase: $x^2 + y^2 = z^2$. Fórmula em display, ' +
          'em linha própria:\n\n$$\\int_0^1 f(x)\\,dx = 1$$\n\n' +
          'E 100% de símbolos que o escaper precisa tratar fora da fórmula: ' +
          '& _ # { }.',
        pergunta:
          'A fórmula em display saiu centralizada e a inline saiu no meio da ' +
          'linha?',
        textoAlternativaA: 'As duas saíram como esperado.',
        textoAlternativaB: 'A inline saiu em display.',
        textoAlternativaC: 'A display saiu inline.',
        textoAlternativaD: 'Nenhuma das duas foi renderizada.',
        textoAlternativaE: 'Os cifrões apareceram literais no PDF.',
      },
    },
    {
      numero: 49,
      questao: {
        status: Status.Approved,
        // ⚠️ `asset://`, jamais `https://`. Se algum dia alguém ligar o
        // resolvedor real neste caminho por engano, `asset://` bate no R2 e
        // devolve 404 — enquanto `https://` faria um endpoint de TESTE emitir
        // requisição de saída a partir de texto fabricado. É também o esquema
        // que o acervo passa a usar depois do card 08.
        textoQuestao:
          'QUESTÃO FALSA — texto de teste do template, sem conteúdo real. ' +
          'A figura abaixo é um retângulo gerado por script; ela existe só ' +
          'para conferir que uma imagem larga encolhe até a largura da coluna.\n\n' +
          '![](asset://exemplo/figura-de-teste)\n\n' +
          // Sem crase: o escaper deixa ` passar cru, e em LaTeX ela vira aspa
          // simples de abertura — o coordenador leria "‘max width’".
          'Se a figura passar da margem, o max width do template está errado.',
        pergunta: 'A figura coube dentro da coluna?',
        textoAlternativaA: 'Coube, com margem dos dois lados.',
        textoAlternativaB: 'Estourou a coluna à direita.',
        textoAlternativaC: 'Saiu ampliada além do tamanho original.',
        textoAlternativaD: 'Saiu no lugar de um marcador de indisponível.',
        textoAlternativaE: 'Saiu colada no texto, sem virar parágrafo próprio.',
      },
    },
    {
      numero: 50,
      questao: {
        status: Status.Approved,
        textoQuestao:
          'QUESTÃO FALSA — texto de teste do template, sem conteúdo real. ' +
          'Aqui o que se confere são as alternativas: uma delas é longa o ' +
          'bastante para ocupar três linhas na coluna, e o recuo da segunda ' +
          'linha em diante precisa continuar alinhado sob o texto, não sob a ' +
          'letra.',
        pergunta: 'A alternativa (C) manteve o recuo nas linhas seguintes?',
        textoAlternativaA:
          'Alternativa de teste longa, com enchimento suficiente para ocupar ' +
          'mais de uma linha na coluna estreita.',
        textoAlternativaB:
          'Outra alternativa de teste longa, também com enchimento, para que ' +
          'duas seguidas quebrem de linha e o espaçamento entre elas apareça.',
        textoAlternativaC:
          'Alternativa de teste deliberadamente muito longa, com enchimento ' +
          'de teste, enchimento de teste, enchimento de teste, enchimento de ' +
          'teste, enchimento de teste, enchimento de teste, enchimento de ' +
          'teste, enchimento de teste, para ocupar três linhas inteiras.',
        textoAlternativaD: 'Alternativa de teste curta.',
        textoAlternativaE:
          'Alternativa de teste média, com enchimento para virar a linha uma ' +
          'vez só.',
      },
    },
    {
      numero: 51,
      questao: {
        status: Status.Approved,
        // ⚠️ Alternativas ausentes de propósito. É o caso dominante do acervo
        // medido, e é o que produz `\choice{}` e o aviso no topo do
        // `conteudo.tex`. Um template de teste que não o mostrasse esconderia
        // do coordenador justamente o problema mais comum.
        textoQuestao:
          'QUESTÃO FALSA — texto de teste do template, sem conteúdo real. ' +
          'Esta questão tem enunciado normal e NENHUMA alternativa preenchida: ' +
          'é assim que aparece a maior parte do acervo hoje.',
        pergunta:
          'As cinco alternativas saíram vazias, e o aviso apareceu no topo do ' +
          'caderno?',
      },
    },
  ],
};
