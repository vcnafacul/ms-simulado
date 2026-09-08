import { Status } from '../../questao/enums/status.enum';
import { escaparForaDaMatematica } from '../latex/escapar-fora-da-matematica';
import { ColetorDeImagens } from './imagens';
import { textoParaLatex } from './texto-para-latex';
import {
  CadernoGerado,
  LETRAS,
  QuestaoParaCaderno,
  SimuladoParaCaderno,
} from './tipos';

/**
 * Um simulado populado vira os dois arquivos `.tex` do caderno.
 *
 * **Função pura, sem I/O**: não busca no Mongo, não lê o R2, não baixa URL,
 * não escreve arquivo. É o que a torna testável sem infraestrutura, e é também
 * o que a impede de fazer requisição de saída a partir de texto que veio de
 * uma questão.
 *
 * Nada lança. Um caderno com uma questão degradada é recuperável; um caderno
 * que não gera, não.
 */

/**
 * Quanto espaço vertical exigir antes de começar uma questão, para o cabeçalho
 * não ficar órfão no pé da coluna. Do pacote `needspace`, carregado no
 * preambulo.tex.
 */
const ESPACO_MINIMO = '\\needspace{10\\baselineskip}';

export function gerarCaderno(
  simulado: SimuladoParaCaderno,
  opts: { draft: boolean },
): CadernoGerado {
  const avisos: string[] = [];
  const coletor = new ColetorDeImagens();

  const selecionadas = selecionar(simulado, opts.draft, avisos);
  const questoesIncluidas = selecionadas.map(({ numero }) => numero);

  const blocos = selecionadas.length
    ? selecionadas.map(({ questao, numero }) =>
        blocoDaQuestao(questao, numero, coletor, avisos),
      )
    : [blocoMarcadorDeVazio(avisos)];

  // ⚠️ O bloco de avisos é montado DEPOIS de os blocos de questão rodarem,
  // porque é durante eles que os avisos aparecem. Calculá-lo antes o deixaria
  // vazio, e nenhum teste acusaria — o conteudo simplesmente não teria os
  // `% AVISO:`.
  const questoesFaltantes = opts.draft
    ? faltantes(simulado, questoesIncluidas)
    : [];

  return {
    conteudo: blocoDeAvisos(avisos) + blocos.join('\n'),
    metadados: gerarMetadados(
      simulado,
      questoesIncluidas,
      questoesFaltantes,
      opts.draft,
    ),
    imagens: [...coletor.imagens],
    avisos,
    questoesIncluidas,
    questoesFaltantes,
  };
}

/**
 * ⚠️ Quebra de linha dentro de um aviso **encerra o comentário** e joga o
 * resto dentro do documento, impresso na prova.
 */
export const umaLinhaSo = (texto: string): string =>
  texto.replace(/[\r\n]+/g, ' ').trim();

function blocoDeAvisos(avisos: string[]): string {
  if (!avisos.length) return '';
  return `${avisos.map((a) => `% AVISO: ${umaLinhaSo(a)}`).join('\n')}\n\n`;
}

/**
 * ⚠️ São dois arquivos porque o `metadados.tex` é lido **no preâmbulo**, antes
 * do `\begin{document}`, e o `conteudo.tex` dentro do documento. A capa
 * precisa do título antes de as questões serem diagramadas.
 */
function gerarMetadados(
  simulado: SimuladoParaCaderno,
  incluidas: number[],
  faltando: number[],
  draft: boolean,
): string {
  const escapar = (t: string) => escaparForaDaMatematica(t);
  const linhas = [
    '% gerado automaticamente por ms-simulado — não editar',
    `\\def\\cadernoTitulo{${escapar(simulado.nome)}}`,
    // O separador é $\cdot$, não o `·` literal: o glifo depende do T1.
    `\\def\\cadernoSubtitulo{${escapar(simulado.categoria.nome)} $\\cdot$ ${
      incluidas.length
    } questões $\\cdot$ ${simulado.categoria.duracao} min}`,
  ];

  if (draft) {
    // ⚠️ \cadernoRascunho é um \newif declarado no preambulo.tex, NÃO um
    // \def. `\def\cadernoRascunho{true}` não liga a marca d'água e NÃO dá
    // erro — ela simplesmente não aparece.
    linhas.push('\\cadernoRascunhotrue');
    linhas.push(`\\def\\cadernoPendencias{${faltando.join(', ')}}`);
  }

  return `${linhas.join('\n')}\n`;
}

/**
 * ⚠️ Reordena sempre, em vez de confiar que o array já veio ordenado.
 *
 * No modo rascunho, filtra o que ainda não pode ser impresso. No normal, tudo
 * entra: o gate de "este simulado pode ser gerado?" é do card 04, não daqui.
 */
function selecionar(
  simulado: SimuladoParaCaderno,
  draft: boolean,
  avisos: string[],
): { questao: QuestaoParaCaderno; numero: number }[] {
  return simulado.questoes
    .filter((q): q is { questao: QuestaoParaCaderno; numero: number } => {
      if (q.numero == null) {
        // No rascunho, questão sem número é esperado e silencioso. No modo
        // normal é anomalia: `todasNumeradas` (simulado/helpers/bloqueado.ts)
        // impede um simulado assim de ser liberado, então chegar aqui quer
        // dizer que algo destravou. Some da prova de um jeito ou de outro — mas
        // sumir CALADO é o que não pode.
        if (!draft) avisos.push('uma questão sem número ficou de fora');
        return false;
      }
      return draft ? q.questao.status === Status.Approved : true;
    })
    .sort((a, b) => a.numero - b.numero);
}

/**
 * Os números que faltam para o caderno ficar completo.
 *
 * ⚠️ **A faixa não começa em 1.** Um simulado do 2º dia do ENEM é numerado
 * 46..90, e varrer `1..quantidadeTotalQuestao` reportaria 1..45 como
 * pendentes — todas erradas, e a caixa de pendências do rascunho viraria
 * ruído. A base sai do menor número que existe no simulado, contando também
 * as questões que o filtro do rascunho deixou de fora.
 */
function faltantes(
  simulado: SimuladoParaCaderno,
  incluidas: number[],
): number[] {
  const alvo = simulado.categoria.quantidadeTotalQuestao;
  // `null` é categoria custom, de quantidade livre (etapa 3) — ver
  // `atingiuQuantidade` em simulado/helpers/bloqueado.ts. Sem alvo, não há o
  // que faltar.
  if (alvo == null) return [];

  const numerados = simulado.questoes
    .map((q) => q.numero)
    .filter((n): n is number => n != null);
  const base = numerados.length ? Math.min(...numerados) : 1;

  const presentes = new Set(incluidas);
  const saida: number[] = [];
  for (let n = base; n < base + alvo; n += 1) {
    if (!presentes.has(n)) saida.push(n);
  }
  return saida;
}

function blocoDaQuestao(
  questao: QuestaoParaCaderno,
  numero: number,
  coletor: ColetorDeImagens,
  avisos: string[],
): string {
  const converter = (texto: string | undefined): string =>
    textoParaLatex(texto, coletor, (m) =>
      avisos.push(`questão ${numero} — ${m}`),
    );

  const enunciado = converter(questao.textoQuestao);
  const pergunta = converter(questao.pergunta);

  const alternativas = LETRAS.map((letra) => {
    const bruto = questao[`textoAlternativa${letra}` as const];
    if (!bruto) {
      avisos.push(`questão ${numero} — alternativa ${letra} está em branco`);
      return '  \\choice{}';
    }
    return `  \\choice ${converter(bruto)}`;
  });

  return [
    ESPACO_MINIMO,
    // ⚠️ O exam.cls incrementa ANTES de imprimir: para sair "QUESTÃO 48", o
    // contador vai a 47. E é um por questão, não só no primeiro, para que um
    // buraco de numeração não desalinhe todas as seguintes.
    `\\setcounter{question}{${numero - 1}}`,
    `\\question ${enunciado}`,
    '',
    pergunta,
    '\\begin{choices}',
    ...alternativas,
    '\\end{choices}',
    '',
  ].join('\n');
}

/**
 * ⚠️ `questions` no exam.cls é ambiente de lista.
 * `\begin{questions}\end{questions}` sem nenhum `\question` dentro dispara
 * "Something's wrong--perhaps a missing \item" e a compilação **para**.
 *
 * É alcançável: no modo rascunho o filtro pode zerar. E um zip que não compila
 * é o pior desfecho desta POC — pior que prova feia, porque a pessoa não
 * recebe nada que dê para consertar.
 */
function blocoMarcadorDeVazio(avisos: string[]): string {
  avisos.push('este simulado não tem nenhuma questão elegível para o caderno');
  return [
    '\\setcounter{question}{0}',
    '\\question \\textbf{[Este simulado não tem nenhuma questão elegível para o caderno.]}',
    '',
  ].join('\n');
}
