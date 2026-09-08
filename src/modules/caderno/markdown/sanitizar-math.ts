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
 * positivo zero por construção — desde que a chamada aqui espelhe a do
 * editor em tudo que muda o resultado, `displayMode` incluído (ver
 * `ehDisplay` abaixo: o editor passa `$$...$$` com `displayMode: true`, e
 * várias construções — `align`, `equation`, `gather`, `\tag` — só existem
 * nesse modo).
 *
 * ⚠️ Continua sendo defesa em profundidade: o card 08 segue obrigado a
 * configurar `openin_any=p` e `-no-shell-escape` no compilador do servidor.
 *
 * ⚠️ FUROU UMA VEZ, e o furo importa entender: `\gdef\textbf#1{\input{/etc/
 * passwd}}` passava. O KaTeX faz parse de `\gdef` como sintaxe — reconhece a
 * forma "defina um macro" — mas guarda o CORPO do macro como tokens crus,
 * sem nunca analisá-lo; a validação do corpo só aconteceria no uso do macro,
 * que nunca ocorre dentro do `__parse`. Em TeX de verdade `\gdef` é global:
 * escapa do `$...$` e reescreve `\textbf` (ou `\alpha`, ou qualquer nome) pro
 * resto do documento — inclusive pra outra questão do mesmo caderno, cada
 * uma passando pelo `__parse` isolada, sem macro compartilhado, então o
 * KaTeX nunca vê o par def+uso. O pdflatex vê.
 *
 * Por isso a família de definição de macro é barrada ANTES do `__parse`, por
 * nome, e não pelo que ela permite escrever. É a única outra construção,
 * junto de `\verb` (catcode 12, sem expansão — inofensivo por definição, daí
 * fora desta lista), em que o KaTeX carrega texto cru sem validar. **Isto
 * não é lista de bloqueio.** Lista de bloqueio enumera comandos perigosos —
 * um conjunto aberto, sempre incompleto, e foi exatamente isso que furou
 * duas vezes antes desta versão. Esta lista enumera uma coisa fechada e
 * inteiramente diferente: as construções em que o PRÓPRIO KaTeX decide não
 * validar o conteúdo. Não apague por achar que é resquício da abordagem
 * antiga — o dia em que o KaTeX ganhar uma nona forma de carregar texto cru
 * sem validar, ela entra aqui do mesmo jeito, e a defesa continua sendo "o
 * KaTeX valida", não "a lista cobre os payloads conhecidos".
 */

/**
 * `katex.__parse` roda a mesma análise que `renderToString` usa por baixo,
 * sem construir a árvore de HTML — é só a parte que interessa aqui. Não está
 * nos tipos públicos do pacote (a API documentada é só `render`,
 * `renderToString`, `ParseError`, `version`), por isso o cast — e por isso a
 * checagem em tempo de carregamento logo abaixo: se uma atualização do
 * KaTeX remover ou renomear `__parse`, isto tem que quebrar no boot do
 * serviço, não no meio de uma requisição de geração de caderno.
 */
type KatexComParse = typeof katex & {
  __parse: (
    expressao: string,
    configuracoes?: Record<string, unknown>,
  ) => unknown;
};

/** Exportado só para o teste que prova que o guard abaixo funciona. */
export function katexTemParseInterno(mod: Record<string, unknown>): boolean {
  return typeof mod.__parse === 'function';
}

if (!katexTemParseInterno(katex as unknown as Record<string, unknown>)) {
  throw new Error(
    'katex.__parse não está disponível nesta versão do pacote katex. ' +
      'sanitizar-math.ts depende dessa API interna (sem tipos públicos) ' +
      'para validar fórmula sem gerar HTML — uma mudança de versão que a ' +
      'remova precisa quebrar aqui, no carregamento do módulo.',
  );
}

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
 * Família de definição de macro — os dez nomes em que o KaTeX guarda texto
 * cru sem validar (ver o comentário grande no topo do arquivo). Barrada
 * antes do `__parse`, por nome: não importa o que vier dentro, porque o
 * KaTeX nunca vai olhar.
 *
 * Medido no código-fonte (`src/functions/def.ts`): `\def`, `\gdef`, `\edef`
 * e `\xdef` são o MESMO `defineFunction`, tratados de forma idêntica — o
 * KaTeX não implementa a semântica de expansão antecipada de `\edef`/`\xdef`,
 * só aceita a sintaxe e guarda o corpo cru do mesmo jeito. Por isso os quatro
 * têm que estar na lista igualmente; não dá pra confiar que algum dos quatro
 * "não seria suportado" e cairia sozinho no `ParseError`.
 *
 * Também verificado na mesma fonte: `\long` (prefixo de `\global`, sem
 * efeito próprio) só completa a definição se o token seguinte for um dos já
 * listados aqui — é literalmente o mapa `globalMap` do arquivo, e nenhuma
 * das suas chaves escapa desta lista. Não existe um jeito de
 * `\long\algumacoisa` chegar em corpo de macro sem que um nome já coberto
 * apareça logo depois. `\outer`/`\protected` nem são implementados pelo
 * KaTeX (comando desconhecido, já cai no `ParseError`). Por isso `\long` e
 * `\outer` não precisam entrar na lista: não têm rota própria até o corpo
 * cru.
 */
const FAMILIA_DEFINICAO = [
  'def',
  'gdef',
  'edef',
  'xdef',
  'global',
  'let',
  'futurelet',
  'newcommand',
  'renewcommand',
  'providecommand',
];
const PADRAO_DEFINICAO = new RegExp(
  `\\\\(${FAMILIA_DEFINICAO.join('|')})(?![A-Za-z])`,
);

/**
 * Por que a fórmula foi barrada.
 *
 * `perigoso` cobre o que a gente sabe que é ruim por nome — família de
 * definição de macro e a exceção do KaTeX — e o aviso pode nomear o comando.
 * `invalido` cobre o `ParseError` do KaTeX: a fórmula não é um ataque
 * conhecido, é sintaxe que o KaTeX não entende — e a informação acionável
 * pra quem cadastrou a questão é que ela já renderizava quebrada no editor,
 * não "comando não permitido".
 */
export type MotivoBloqueio =
  | { motivo: 'perigoso'; comando: string }
  | { motivo: 'invalido'; detalhe: string };

/**
 * Devolve o motivo do bloqueio, ou `null` se a fórmula é segura para entrar
 * no `.tex` sem alteração.
 *
 * `ehDisplay` espelha o `displayMode` do KaTeX: o editor passa `true` pra
 * fórmula `$$...$$` (bloco) e `false` pra `$...$` (inline), e várias
 * construções — `align`, `equation`, `gather`, `\tag` — só existem em modo
 * display. Fixar `displayMode: true` aqui alargaria em silêncio o que se
 * aceita no caminho inline; por isso o parâmetro, com default `false` pra
 * não quebrar chamador que ainda não o repassa.
 */
export function comandoBarrado(
  formula: string,
  ehDisplay = false,
): MotivoBloqueio | null {
  const definicao = PADRAO_DEFINICAO.exec(formula);
  if (definicao) {
    return { motivo: 'perigoso', comando: `\\${definicao[1]}` };
  }

  try {
    katexComParse.__parse(formula, {
      strict: 'ignore',
      trust: false,
      displayMode: ehDisplay,
    });
  } catch (erro) {
    if (erro instanceof katex.ParseError) {
      return {
        motivo: 'invalido',
        detalhe: `esta fórmula já aparecia quebrada no editor (KaTeX rejeitou): ${erro.rawMessage}`,
      };
    }
    throw erro;
  }

  const excecao = PADRAO_EXCECAO.exec(formula);
  return excecao ? { motivo: 'perigoso', comando: `\\${excecao[1]}` } : null;
}
