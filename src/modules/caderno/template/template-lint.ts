import { semComentarios } from './sem-comentarios';

export interface ResultadoDoLint {
  erros: string[];
  avisos: string[];
  /** `true` quando não há erros. O publicar consulta só isto. */
  podePublicar: boolean;
}

/**
 * Lint estrutural do template do caderno.
 *
 * ⚠️ **Ele não prova que o template compila** — prova que não está
 * obviamente quebrado. Quem edita o template não é desenvolvedor e não tem
 * compilador no caminho: sem esta régua, um zip ruim para a geração de prova
 * para todo mundo.
 *
 * Sete regras bloqueiam e duas avisam. As duas que avisam são as que podem dar
 * falso positivo num template válido, e falso positivo aqui trava o
 * coordenador **depois** de ele ter visto o PDF compilar no Overleaf.
 *
 * ⚠️ **Tudo roda sobre o texto sem comentário.** Nos dois sentidos: um
 * `\input{conteudo}` comentado compila lindamente e sai **sem questão
 * nenhuma**; um `\write18` comentado não é perigo nenhum.
 */
export function lintarTemplate(
  arquivos: Record<string, string>,
): ResultadoDoLint {
  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. Limpa cada arquivo, guardando as linhas — as mensagens precisam do
  //    número, e `semComentarios` preserva as quebras justamente por isso.
  const limpos = Object.entries(arquivos ?? {}).map(([nome, texto]) => ({
    nome,
    texto: semComentarios(texto),
  }));

  // 2. As de presença olham o template inteiro: o `\documentclass` pode
  //    morar em qualquer arquivo, e o arquivo não entra na mensagem porque
  //    o que faltou não está em lugar nenhum.
  const tudo = limpos.map((a) => a.texto).join('\n');
  for (const regra of PRESENCA) {
    if (!regra.teste.test(tudo)) {
      erros.push(
        `falta \`${regra.rotulo}\`: não aparece em nenhum arquivo do template (fora de comentário)`,
      );
    }
  }

  // 3. As de conteúdo dizem arquivo e linha.
  for (const arquivo of limpos) {
    erros.push(...proibidos(arquivo));
    erros.push(...ambientesDesbalanceados(arquivo));
    avisos.push(...chavesDesbalanceadas(arquivo));
  }
  avisos.push(...macrosIndefinidas(limpos));

  return { erros, avisos, podePublicar: erros.length === 0 };
}

interface Arquivo {
  nome: string;
  texto: string;
}

const onde = (arquivo: Arquivo, linha: number) =>
  `${arquivo.nome}, linha ${linha}`;

/** Uma sequência de controle termina onde a letra acaba: `\openin1` conta. */
const cs = (nome: string) => new RegExp(`\\\\${nome}(?![a-zA-Z])`);

// --- as de presença --------------------------------------------------------

/**
 * ⚠️ Toleram espaço (`\begin {document}`) e a extensão explícita
 * (`\input{preambulo.tex}`): as duas formas compilam igual, e reprovar quem
 * escreveu a variante válida é o mesmo falso positivo de sempre.
 */
const PRESENCA: { rotulo: string; teste: RegExp }[] = [
  { rotulo: '\\documentclass', teste: /\\documentclass(?![a-zA-Z])/ },
  { rotulo: '\\begin{document}', teste: /\\begin\s*\{\s*document\s*\}/ },
  { rotulo: '\\end{document}', teste: /\\end\s*\{\s*document\s*\}/ },
  { rotulo: '\\begin{questions}', teste: /\\begin\s*\{\s*questions\s*\}/ },
  { rotulo: '\\end{questions}', teste: /\\end\s*\{\s*questions\s*\}/ },
  {
    rotulo: '\\input{preambulo}',
    teste: /\\input\s*\{\s*preambulo(\.tex)?\s*\}/,
  },
  {
    rotulo: '\\input{metadados}',
    teste: /\\input\s*\{\s*metadados(\.tex)?\s*\}/,
  },
  {
    rotulo: '\\input{conteudo}',
    teste: /\\input\s*\{\s*conteudo(\.tex)?\s*\}/,
  },
];

// --- as proibidas ----------------------------------------------------------

/** Primitivas que saem do sandbox: shell, leitura e escrita de arquivo. */
const PRIMITIVAS_PROIBIDAS: { rotulo: string; teste: RegExp }[] = [
  { rotulo: '\\write18', teste: cs('write18') },
  { rotulo: '\\openin', teste: cs('openin') },
  { rotulo: '\\openout', teste: cs('openout') },
  { rotulo: '\\ShellEscape', teste: cs('ShellEscape') },
  { rotulo: '\\directlua', teste: cs('directlua') },
];

/** Pacotes cujo propósito é justamente abrir o shell. */
const PACOTES_PROIBIDOS = ['shellesc', 'write18'];

const CARREGA_PACOTE =
  /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

/**
 * ⚠️ `includegraphics` vem antes de `include` na alternância: a ordem importa
 * menos do que parece (o regex retrocede), mas deixa a intenção explícita.
 */
const PUXA_ARQUIVO =
  /\\(includegraphics|include|input)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

function proibidos(arquivo: Arquivo): string[] {
  const achados: string[] = [];

  arquivo.texto.split('\n').forEach((linha, i) => {
    const n = i + 1;

    for (const p of PRIMITIVAS_PROIBIDAS) {
      if (p.teste.test(linha)) {
        achados.push(
          `${onde(arquivo, n)}: comando proibido \`${p.rotulo}\` — o template não pode sair do LaTeX`,
        );
      }
    }

    for (const [lista] of matches(linha, CARREGA_PACOTE)) {
      for (const pacote of lista.split(',')) {
        if (PACOTES_PROIBIDOS.includes(pacote.trim().toLowerCase())) {
          achados.push(
            `${onde(arquivo, n)}: pacote proibido \`${pacote.trim()}\` — abre o shell durante a compilação`,
          );
        }
      }
    }

    for (const [comando, caminho] of matches(linha, PUXA_ARQUIVO)) {
      if (saiDoProjeto(caminho)) {
        achados.push(
          `${onde(arquivo, n)}: \`\\${comando}{${caminho}}\` aponta para fora do diretório do projeto`,
        );
      }
    }
  });

  return achados;
}

/**
 * ⚠️ A regra é sobre **sair** do diretório, não sobre ter barra.
 * `\input{sub/arquivo}` não sai: ele só não existe no zip, e a falha aparece
 * na compilação, visível. Reprovar aqui seria proibir subpasta — e as imagens
 * das questões moram em `assets/`.
 */
function saiDoProjeto(caminho: string): boolean {
  const limpo = caminho.trim();
  if (limpo.length === 0) return false;
  if (limpo.startsWith('/') || limpo.startsWith('~')) return true;
  if (/^[a-zA-Z]:[\\/]/.test(limpo)) return true;
  return limpo.split('/').some((parte) => parte === '..');
}

// --- balanceamento de ambientes (erro) -------------------------------------

const ABRE_FECHA = /\\(begin|end)\s*\{\s*([^}]*?)\s*\}/g;

function ambientesDesbalanceados(arquivo: Arquivo): string[] {
  const achados: string[] = [];
  const pilha: { nome: string; linha: number }[] = [];

  arquivo.texto.split('\n').forEach((linha, i) => {
    const n = i + 1;
    for (const [tipo, nome] of matches(linha, ABRE_FECHA)) {
      if (tipo === 'begin') {
        pilha.push({ nome, linha: n });
        continue;
      }
      const aberto = pilha.pop();
      if (aberto === undefined) {
        achados.push(
          `${onde(arquivo, n)}: \`\\end{${nome}}\` sem \`\\begin{${nome}}\` correspondente`,
        );
      } else if (aberto.nome !== nome) {
        achados.push(
          `${onde(arquivo, n)}: \`\\end{${nome}}\` fecha \`\\begin{${aberto.nome}}\` aberto na linha ${aberto.linha}`,
        );
      }
    }
  });

  for (const aberto of pilha) {
    achados.push(
      `${onde(arquivo, aberto.linha)}: \`\\begin{${aberto.nome}}\` nunca é fechado`,
    );
  }

  return achados;
}

// --- balanceamento de chaves (AVISO) ---------------------------------------

/**
 * ⚠️ **Avisa, não bloqueia.** É a única das oito regras que pode dar falso
 * positivo em LaTeX válido — `\verb|{|`, mudança de catcode — e o fluxo já
 * garante uma compilação real no Overleaf antes do upload. Se bloqueasse,
 * travaria o coordenador depois de ele ter visto o PDF pronto.
 *
 * ⚠️ Ignora `\{` e `\}` escapados (o texto já vem sem comentário): sem isso um
 * `%` com chave solta produziria aviso falso, e aviso falso repetido faz a
 * pessoa parar de ler os avisos.
 */
function chavesDesbalanceadas(arquivo: Arquivo): string[] {
  let saldo = 0;
  const texto = arquivo.texto;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c !== '{' && c !== '}') continue;
    if (escapado(texto, i)) continue;
    saldo += c === '{' ? 1 : -1;
  }

  if (saldo === 0) return [];
  return [
    saldo > 0
      ? `${arquivo.nome}: ${saldo} \`{\` sem \`}\` correspondente — confira, mas pode ser legítimo (o Overleaf é quem diz se compila)`
      : `${arquivo.nome}: ${-saldo} \`}\` sem \`{\` correspondente — confira, mas pode ser legítimo (o Overleaf é quem diz se compila)`,
  ];
}

/** Mesma paridade de barras do `semComentarios`: ímpar escapa, par não. */
function escapado(texto: string, i: number): boolean {
  let barras = 0;
  for (let j = i - 1; j >= 0 && texto[j] === '\\'; j -= 1) barras += 1;
  return barras % 2 === 1;
}

// --- macros do caderno não definidas (AVISO) -------------------------------

/**
 * ⚠️ São **quatro**, não três — medido em `gerar-caderno.ts:90-105`.
 * `\cadernoTitulo` e `\cadernoSubtitulo` sempre; `\cadernoRascunho` e
 * `\cadernoPendencias` só no modo rascunho. Com uma lista de três, o
 * `preambulo.tex` do próprio repo avisaria: ele usa `\cadernoPendencias`.
 */
const MACROS_DO_METADADOS = [
  'cadernoTitulo',
  'cadernoSubtitulo',
  'cadernoPendencias',
];

/**
 * ⚠️ `\cadernoRascunho` é um `\newif`, não um `\def`: o metadados.tex liga com
 * `\cadernoRascunhotrue` e o template lê com `\ifcadernoRascunho`. As três
 * grafias são a mesma macro.
 */
const NEWIFS_DO_METADADOS = ['cadernoRascunho'];

const DEFINE_COMANDO =
  /\\(?:new|renew|provide)command\*?\s*\{?\s*\\([a-zA-Z@]+)/g;
const DEFINE_DEF = /\\(?:[egx])?def\s*\\([a-zA-Z@]+)/g;
const DEFINE_LET = /\\let\s*\\([a-zA-Z@]+)/g;
const DEFINE_NEWIF = /\\newif\s*\\if([a-zA-Z@]+)/g;
const USA_MACRO = /\\([a-zA-Z@]+)/g;

function macrosIndefinidas(limpos: Arquivo[]): string[] {
  const definidas = new Set<string>();
  for (const nome of MACROS_DO_METADADOS) definidas.add(nome);
  for (const base of NEWIFS_DO_METADADOS) grafiasDoNewif(base, definidas);

  // ⚠️ Conta como definida a macro que o **próprio template** define. O
  // `preambulo.tex` real tem `\providecommand{\cadernoTitulo}{...}` de
  // propósito, para quando o metadados.tex não vem; avisar sobre isso
  // transformaria o mecanismo de default do template em ruído.
  for (const arquivo of limpos) {
    for (const [nome] of matches(arquivo.texto, DEFINE_COMANDO)) {
      definidas.add(nome);
    }
    for (const [nome] of matches(arquivo.texto, DEFINE_DEF))
      definidas.add(nome);
    for (const [nome] of matches(arquivo.texto, DEFINE_LET))
      definidas.add(nome);
    for (const [base] of matches(arquivo.texto, DEFINE_NEWIF)) {
      grafiasDoNewif(base, definidas);
    }
  }

  const achados: string[] = [];
  const jaAvisadas = new Set<string>();

  for (const arquivo of limpos) {
    arquivo.texto.split('\n').forEach((linha, i) => {
      for (const [nome] of matches(linha, USA_MACRO)) {
        if (!/caderno/i.test(nome)) continue;
        if (definidas.has(nome)) continue;
        if (jaAvisadas.has(nome)) continue;
        jaAvisadas.add(nome);
        achados.push(
          `${onde(arquivo, i + 1)}: \`\\${nome}\` não é definida pelo template nem gerada pelo metadados.tex — vai sair vazia ou quebrar`,
        );
      }
    });
  }

  return achados;
}

/** `\newif\ifX` cria de uma vez `\ifX`, `\Xtrue` e `\Xfalse`. */
function grafiasDoNewif(base: string, destino: Set<string>): void {
  destino.add(base);
  destino.add(`if${base}`);
  destino.add(`${base}true`);
  destino.add(`${base}false`);
}

/**
 * `matchAll` sem depender do target do TS: devolve só os grupos de captura.
 *
 * ⚠️ Reinicia o `lastIndex`: os regexes são constantes de módulo com a flag
 * `g`, e um `lastIndex` vazado faria o segundo arquivo começar a busca no meio.
 */
function matches(texto: string, regex: RegExp): string[][] {
  const saida: string[][] = [];
  regex.lastIndex = 0;
  let m = regex.exec(texto);
  while (m !== null) {
    saida.push(m.slice(1));
    if (m.index === regex.lastIndex) regex.lastIndex += 1;
    m = regex.exec(texto);
  }
  regex.lastIndex = 0;
  return saida;
}
