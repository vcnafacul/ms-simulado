import katex from 'katex';

/**
 * Valida a fórmula usando o próprio KaTeX.
 *
 * A matemática passa sem escape — o editor grava LaTeX de verdade e escapar
 * mataria a feature. Isso abre um canal: quem cadastra questão pode escrever
 * `$\input{/etc/passwd}$`, e o `.tex` gerado carrega o comando intacto. Na
 * fase 1 quem compila é o usuário, sem as proteções que o card 08 planeja.
 *
 * A primeira versão disto era lista de bloqueio, e não sustentou: o TeX aceita
 * `^^5cinput{...}`, que não contém uma barra invertida sequer (`^^5c` vira `\`
 * antes da tokenização), e o `\pdffiledump` lê arquivo sem conter nenhum
 * radical proibido. Lista de bloqueio cobre o que se conhece; o lexer do TeX
 * sabe soletrar `\input` sem as letras de `input`.
 *
 * O KaTeX resolve isso por inversão: ele aceita só o que entende, e não
 * entende I/O de arquivo. E — o ponto que torna isto barato — o editor
 * renderiza com KaTeX puro, sem extensão nenhuma (confirmado em
 * `client-vcnafacul/src/components/molecules/richTextEditor/extensions/LatexExtension.ts`
 * e `RichTextRenderer.tsx`: nenhum dos dois importa `katex/contrib/mhchem`
 * nem qualquer outra extensão). Uma fórmula rejeitada aqui **já aparecia
 * quebrada para quem cadastrou a questão** — inclusive `\ce{H2O}` (mhchem) e
 * `\SI{10}{\meter}` (siunitx), que o KaTeX bare também rejeita. Falso
 * positivo zero por construção, e por isso mesmo esta função tem que usar o
 * KaTeX exatamente como o editor usa: sem extensão, sem macro extra.
 *
 * ⚠️ Continua sendo defesa em profundidade: o card 08 segue obrigado a
 * configurar `openin_any=p` e `-no-shell-escape` no compilador do servidor.
 */

/**
 * `katex.__parse` roda a mesma análise que `renderToString` usa por baixo,
 * sem construir a árvore de HTML — é só a parte que interessa aqui. Não está
 * nos tipos públicos do pacote (a API documentada é só `render`,
 * `renderToString`, `ParseError`, `version`), por isso o cast.
 */
type KatexComParse = typeof katex & {
  __parse: (
    expressao: string,
    configuracoes?: Record<string, unknown>,
  ) => unknown;
};

const katexComParse = katex as KatexComParse;

/**
 * Comandos que o KaTeX aceita sem lançar erro, mas que em LaTeX de verdade
 * leem arquivo do disco ou fazem requisição de rede: `\includegraphics`
 * insere qualquer imagem ou PDF do compilador local; `\href` e `\url` criam
 * link real. O KaTeX aceita os três porque, por padrão (`trust: false`), ele
 * troca o comando por um indicador de "não suportado" em vez de lançar — mas
 * essa troca é só na árvore de renderização. O texto cru que vira o `.tex`
 * não passa por ela; carrega o comando intacto.
 *
 * Medido no código-fonte do KaTeX (`grep -rn "isTrusted(" src/functions/`):
 * são exatamente sete os comandos com esse gate, e só estes três têm
 * capacidade de arquivo/rede em LaTeX real. Os outros quatro (`\htmlClass`,
 * `\htmlId`, `\htmlStyle`, `\htmlData`) são extensão só do KaTeX — em
 * pdflatex viram "Undefined control sequence" e a compilação já falha, sem
 * I/O nenhum, então não entram nesta lista. `\includesvg` (pacote real,
 * mesma família de `\includegraphics`) nem chega a ser exceção: o KaTeX não
 * o implementa, então já cai como comando desconhecido.
 */
const COMANDOS_ACEITOS_MAS_BARRADOS = ['includegraphics', 'href', 'url'];
const PADRAO_EXCECAO = new RegExp(
  `\\\\(${COMANDOS_ACEITOS_MAS_BARRADOS.join('|')})(?![A-Za-z])`,
);

/**
 * Extrai o nome do comando da mensagem de erro do KaTeX, quando dá. A
 * mensagem crua de "Undefined control sequence" traz o nome literal do
 * comando; erros de sintaxe (chave faltando, etc.) não têm comando para
 * extrair, e a chamada cai no texto genérico.
 */
function comandoDoErro(
  erro: InstanceType<typeof katex.ParseError>,
): string | null {
  const achado = /\\[A-Za-z@]+/.exec(erro.rawMessage);
  return achado ? achado[0] : null;
}

/**
 * Devolve o comando (ou motivo) que bloqueia a fórmula, ou `null` se ela é
 * segura para entrar no `.tex` sem alteração.
 */
export function comandoBarrado(formula: string): string | null {
  try {
    katexComParse.__parse(formula, { strict: 'ignore', trust: false });
  } catch (erro) {
    if (erro instanceof katex.ParseError) {
      return (
        comandoDoErro(erro) ?? `fórmula LaTeX inválida: ${erro.rawMessage}`
      );
    }
    throw erro;
  }

  const excecao = PADRAO_EXCECAO.exec(formula);
  return excecao ? `\\${excecao[1]}` : null;
}
