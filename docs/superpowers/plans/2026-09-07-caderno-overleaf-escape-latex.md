# Caderno · Overleaf — Card 01: escape LaTeX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o texto de uma questão entrar num `.tex` sem sumir nem quebrar, preservando a matemática intacta.

**Architecture:** Duas funções puras em arquivos separados. `escapeLatex` escapa treze caracteres numa passada única e não sabe nada de matemática — vem pronta e revisada de outra branch. `escaparForaDaMatematica` varre a string decidindo onde há fórmula e chama a primeira só fora dela.

**Tech Stack:** TypeScript (CommonJS), Jest 29 + ts-jest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-07-caderno-overleaf-escape-latex-design.md` (commit `0f6ff75`)

---

## Contexto que o plano assume

**Esta POC não converte markdown.** O texto da questão entra no molde LaTeX literalmente, com um
`\question` na frente. `**negrito**` sai com os asteriscos — isso é decisão, não lacuna.

**Uma coisa não pode entrar literal:** em LaTeX, `%` é comentário. "100% dos casos" imprime `100` e o
resto da linha **desaparece**, sem erro e sem aviso. É o critério que separa o que fica do que vai
embora nesta POC — defeito visível alguém conserta, texto que sumiu não — e é por isso que o escape é
a única peça com esperteza que sobrou.

**Não há distribuição TeX nesta máquina e instalar está fora de escopo.** Nunca tente compilar. Este
card não tem gate no Overleaf: a tabela de escape já passou por compilação real na POC anterior, e o
que é novo aqui é verificável inspecionando a string de saída. Um erro daqui aparece no gate do card
02, o que foi escolha consciente.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/latex/escape-latex.ts` | Escapar treze caracteres, passada única. Não sabe de matemática. |
| `src/modules/caderno/latex/escape-latex.spec.ts` | Os testes que vêm junto, incluindo a varredura do ASCII. |
| `src/modules/caderno/latex/escapar-fora-da-matematica.ts` | Decidir **onde** escapar: varre, acha as regiões de fórmula, chama o escaper fora. |
| `src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts` | Uma fixture por regra do scanner e uma por caso patológico. |

Os nomes são deliberadamente diferentes em vez de `escapeLatex`/`escaparParaLatex`, que se confundem
na chamada.

---

### Task 1: `escapeLatex` — cópia da POC anterior

**Files:**
- Create: `src/modules/caderno/latex/escape-latex.ts`
- Create: `src/modules/caderno/latex/escape-latex.spec.ts`

Estes dois arquivos **já existem, escritos e revisados**, na branch `origin/feature/caderno-02-conversor-markdown` (PR #175 do `ms-simulado`). Passaram por dois ciclos de review, e o escape da aspa dupla saiu de um achado sobre o `babel[brazil]`. Não reescrever.

- [ ] **Step 1: Copiar os dois arquivos**

Cópia byte-a-byte via `git show` — não abra num editor, para não arriscar encoding.

```bash
mkdir -p src/modules/caderno/latex
ORIG=origin/feature/caderno-02-conversor-markdown:src/modules/caderno/markdown

git show $ORIG/escape-latex.ts      > src/modules/caderno/latex/escape-latex.ts
git show $ORIG/escape-latex.spec.ts > src/modules/caderno/latex/escape-latex.spec.ts
```

- [ ] **Step 2: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/latex/escape-latex.spec.ts
```

Esperado: PASS, 6 testes.

Repare que aqui o teste **não** começa vermelho: o código veio pronto e testado. O TDD desta task
aconteceu na branch de origem; o que importa agora é provar que a cópia chegou íntegra.

- [ ] **Step 3: Provar que a cópia é byte-idêntica**

```bash
ORIG=origin/feature/caderno-02-conversor-markdown:src/modules/caderno/markdown
diff <(git show $ORIG/escape-latex.ts)      src/modules/caderno/latex/escape-latex.ts      && echo "escape-latex.ts OK"
diff <(git show $ORIG/escape-latex.spec.ts) src/modules/caderno/latex/escape-latex.spec.ts && echo "spec OK"
```

Esperado: as duas linhas de OK, sem saída de diferença.

- [ ] **Step 4: Confirmar o encoding**

Os arquivos têm acento em comentários (`hífen discricionário`, `impressa`). Confirme que decodificam
como UTF-8 estrito e que não há mojibake (`Ã£`, `Ã§`, `â€`).

- [ ] **Step 5: Lint e commit**

```bash
npx prettier --write src/modules/caderno/latex/escape-latex.ts src/modules/caderno/latex/escape-latex.spec.ts
npx eslint src/modules/caderno/latex/escape-latex.ts src/modules/caderno/latex/escape-latex.spec.ts
git add src/modules/caderno/latex/
git commit -m "$(cat <<'EOF'
feat(caderno): trazer o escapeLatex ja revisado

Copia byte-a-byte da branch do card 02 da POC anterior, onde passou por
dois ciclos de review. Escapa treze caracteres em passada unica.

A aspa dupla saiu de um achado sobre o babel[brazil], que a torna ativa:
sem escapar, "" vira salto de largura zero e as aspas somem da prova.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

⚠️ Passe **caminhos de arquivo** ao eslint e ao prettier, nunca um diretório: `npx eslint <dir>`
reformata arquivos não relacionados neste repo. Use caminhos explícitos no `git add` também.

---

### Task 2: `escaparForaDaMatematica` — o scanner

**Files:**
- Create: `src/modules/caderno/latex/escapar-fora-da-matematica.ts`
- Create: `src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts`:

```ts
import { escaparForaDaMatematica } from './escapar-fora-da-matematica';

describe('escaparForaDaMatematica — o que abre fórmula', () => {
  it('deixa a matemática do editor intacta', () => {
    // O editor grava `${fórmula}$` e `$${fórmula}$$`, sempre numa linha.
    expect(escaparForaDaMatematica('$x^2$')).toBe('$x^2$');
    expect(escaparForaDaMatematica('$\\frac{1}{2}$')).toBe('$\\frac{1}{2}$');
    expect(escaparForaDaMatematica('$$\\int_0^1 x\\,dx$$')).toBe(
      '$$\\int_0^1 x\\,dx$$',
    );
  });

  it('abre em $R$, que é fórmula legítima', () => {
    // R de raio, de resistência. A âncora olha o caractere ANTES do cifrão,
    // e aqui é espaço — por isso `$R$` sobrevive enquanto `R$` não abre.
    expect(escaparForaDaMatematica('o raio $R$ e o dobro')).toBe(
      'o raio $R$ e o dobro',
    );
  });
});

describe('escaparForaDaMatematica — o que NÃO abre fórmula', () => {
  it('não abre depois de R ou r: é dinheiro', () => {
    expect(escaparForaDaMatematica('custa R$ 12,00')).toBe('custa R\\$ 12,00');
    // Sem a âncora, os dois cifrões abririam uma fórmula com a prosa dentro.
    expect(escaparForaDaMatematica('custa R$ 50,00 e outro R$ 30,00')).toBe(
      'custa R\\$ 50,00 e outro R\\$ 30,00',
    );
    // A regra do espaço não pegaria este: o cifrão vem colado no dígito.
    expect(escaparForaDaMatematica('taxa de R$5 e R$3')).toBe(
      'taxa de R\\$5 e R\\$3',
    );
    expect(escaparForaDaMatematica('custa r$ 9,90')).toBe('custa r\\$ 9,90');
  });

  it('não abre quando o cifrão vem seguido de espaço', () => {
    // O editor nunca grava `$ fórmula $`. Espaço depois do cifrão é dinheiro.
    expect(escaparForaDaMatematica('custa $ 50 e $ 30')).toBe(
      'custa \\$ 50 e \\$ 30',
    );
    expect(escaparForaDaMatematica('US$ 40')).toBe('US\\$ 40');
  });

  it('recusa fórmula escrita com espaço dentro dos delimitadores', () => {
    // Falso negativo ACEITO, não bug: o editor nunca grava assim, mas
    // conteúdo colado à mão pode. Sai como texto escapado — visível, e
    // portanto corrigível por quem imprime.
    expect(escaparForaDaMatematica('$ x^2 $')).toBe('\\$ x\\textasciicircum{}2 \\$');
  });

  it('não abre sem fechamento adiante', () => {
    // É o que impede um cifrão solto de engolir o escape de todo o resto.
    expect(escaparForaDaMatematica('custa $ 50')).toBe('custa \\$ 50');
    expect(escaparForaDaMatematica('valor em $')).toBe('valor em \\$');
    expect(escaparForaDaMatematica('$abc')).toBe('\\$abc');
  });
});

describe('escaparForaDaMatematica — o % dentro da fórmula', () => {
  it('escapa o % cru, porque é comentário em qualquer modo', () => {
    expect(escaparForaDaMatematica('$50% off$')).toBe('$50\\% off$');
  });

  it('não toca no % que já vem escapado', () => {
    // `$50\%$` é fórmula plausível. Escapar de novo faria `\%` virar `\\%`,
    // que é quebra de linha seguida de comentário.
    expect(escaparForaDaMatematica('$50\\%$')).toBe('$50\\%$');
  });

  it('escapa o % do texto normalmente', () => {
    expect(escaparForaDaMatematica('50% de $x$')).toBe('50\\% de $x$');
  });
});

describe('escaparForaDaMatematica — bordas', () => {
  it('string vazia devolve vazia', () => {
    expect(escaparForaDaMatematica('')).toBe('');
  });

  it('texto sem cifrão nenhum atravessa como o escaper puro', () => {
    expect(escaparForaDaMatematica('100% dos casos & mais')).toBe(
      '100\\% dos casos \\& mais',
    );
  });

  it('$$ sozinho vira dois cifrões visíveis', () => {
    // Fórmula inline vazia. Não abre por falta de fechamento, e o defeito
    // fica visível — que é o que se quer nesta POC.
    expect(escaparForaDaMatematica('$$')).toBe('\\$\\$');
  });

  it('$$$$ é display vazio e atravessa intacto', () => {
    expect(escaparForaDaMatematica('$$$$')).toBe('$$$$');
  });

  it('$a$$b$ vira duas fórmulas', () => {
    // O scanner é ganancioso da esquerda. Caso patológico, decidido em vez
    // de emergente.
    expect(escaparForaDaMatematica('$a$$b$')).toBe('$a$$b$');
  });

  it('a frase completa, com os três comportamentos juntos', () => {
    expect(
      escaparForaDaMatematica(
        'A resistência $R$ custa R$ 12,00 e a energia é $$E = mc^2$$.',
      ),
    ).toBe('A resistência $R$ custa R\\$ 12,00 e a energia é $$E = mc^2$$.');
  });
});

describe('escaparForaDaMatematica — limitação conhecida', () => {
  it('erra em US$40 seguido de outro cifrão', () => {
    // A âncora é só no R. Fechar isto significaria listar prefixos de moeda,
    // e a lista nunca acaba. Registrado como limitação, não como bug oculto:
    // se aparecer no acervo, vira ticket com um caso real na mão.
    expect(escaparForaDaMatematica('US$40 e US$50')).toBe('US$40 e US$50');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts
```

Esperado: FAIL — `Cannot find module './escapar-fora-da-matematica'`.

- [ ] **Step 3: Implementar**

Criar `src/modules/caderno/latex/escapar-fora-da-matematica.ts`:

```ts
import { escapeLatex } from './escape-latex';

/**
 * Escapa o texto de uma questão para LaTeX, deixando a matemática intacta.
 *
 * Esta POC não converte markdown: o texto entra no molde literalmente. Mas não
 * pode entrar CRU — em LaTeX o `%` é comentário, e "100% dos casos" imprimiria
 * `100` com o resto da linha desaparecendo, sem erro e sem aviso.
 *
 * Fórmula é o oposto: `_`, `^`, `{`, `}`, `\` e `&` são sintaxe essencial
 * dentro dela, e escapá-los quebraria `x^2`, `\frac{1}{2}` e o `&` do
 * `\begin{align}`. Por isso o escape acontece só fora das regiões de
 * matemática, e esta função existe para achar essas regiões.
 *
 * Os delimitadores **não são tocados**: o trecho de fórmula atravessa inteiro,
 * com os `$`, e o LaTeX renderiza display sozinho.
 */

/**
 * Único caractere escapado dentro da fórmula: `%` é comentário em qualquer
 * modo, inclusive dentro de `$...$`.
 *
 * ⚠️ Só o que ainda não está escapado. `$50\%$` é fórmula plausível — uma
 * porcentagem dentro de conta — e escapar de novo faria `\%` virar `\\%`, que
 * é quebra de linha seguida de comentário.
 */
const escaparPorcentoEmMath = (trecho: string): string =>
  trecho.replace(/(?<!\\)%/g, '\\%');

/**
 * Devolve o delimitador que abre fórmula na posição `i`, ou `null` se ali o
 * cifrão é texto.
 *
 * Três condições combinadas, e cada uma existe por um caso real:
 *
 * 1. **Não precedido de R/r.** `R$ 50` e `R$5` são dinheiro. A âncora olha o
 *    caractere ANTES do cifrão, e é por isso que `$R$` continua abrindo — ali
 *    o anterior é espaço, e o `R` é a variável dentro da fórmula.
 * 2. **Não seguido de espaço.** O editor grava `${fórmula}$`, sempre colado.
 *    Espaço depois do cifrão é dinheiro: `custa $ 50 e $ 30`.
 * 3. **Com fechamento adiante.** Impede um cifrão solto de abrir uma região
 *    que nunca fecha e engolir o escape de todo o resto do texto.
 *
 * A condição 1 e a 2 se complementam: sozinha, a 2 não pega `R$5`, e sozinha,
 * a 1 não pega `US$ 40`.
 */
function delimitadorQueAbre(texto: string, i: number): string | null {
  if (texto[i] !== '$') return null;

  const delim = texto.startsWith('$$', i) ? '$$' : '$';

  const anterior = texto[i - 1];
  if (anterior === 'R' || anterior === 'r') return null;

  const seguinte = texto[i + delim.length];
  if (seguinte === undefined || /\s/.test(seguinte)) return null;

  if (texto.indexOf(delim, i + delim.length) === -1) return null;

  return delim;
}

export function escaparForaDaMatematica(texto: string): string {
  const saida: string[] = [];
  let textoPendente = '';
  let i = 0;

  // Acumula o texto comum e só escapa ao fechar a corrida, para o escaper
  // rodar uma vez por trecho em vez de uma vez por caractere.
  const despejarTexto = (): void => {
    if (textoPendente) {
      saida.push(escapeLatex(textoPendente));
      textoPendente = '';
    }
  };

  while (i < texto.length) {
    const delim = delimitadorQueAbre(texto, i);

    if (delim) {
      const fim = texto.indexOf(delim, i + delim.length);
      despejarTexto();
      saida.push(escaparPorcentoEmMath(texto.slice(i, fim + delim.length)));
      i = fim + delim.length;
      continue;
    }

    textoPendente += texto[i];
    i += 1;
  }

  despejarTexto();
  return saida.join('');
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts
```

Esperado: PASS, 16 testes.

- [ ] **Step 5: Provar que cada uma das três condições morde**

Este é o passo mais importante da task. São condições **combinadas**, e é fácil um teste passar por
acidente porque outra condição já rejeitava aquele caso. Remova uma de cada vez, rode, confirme
vermelho, restaure, confirme verde. Cole as três saídas vermelhas.

| Condição a remover | Teste que precisa ficar vermelho |
|---|---|
| a âncora do `R` (`if (anterior === 'R' \|\| anterior === 'r')`) | `taxa de R$5 e R$3` — repare que `R$ 50,00 e R$ 30,00` continuaria verde pela regra do espaço, e é por isso que a fixture com o cifrão colado no dígito existe |
| a regra do espaço (`/\s/.test(seguinte)`) | `custa $ 50 e $ 30` |
| a exigência de fechamento (`indexOf(...) === -1`) | `$abc` |

Se alguma remoção **não** deixar nenhum teste vermelho, a fixture correspondente está passando por
acidente — reporte em vez de ajustar.

- [ ] **Step 6: Lint e commit**

```bash
npx prettier --write src/modules/caderno/latex/escapar-fora-da-matematica.ts src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts
npx eslint src/modules/caderno/latex/escapar-fora-da-matematica.ts src/modules/caderno/latex/escapar-fora-da-matematica.spec.ts
git add src/modules/caderno/latex/
git commit -m "$(cat <<'EOF'
feat(caderno): escapar fora da matematica

Varre a string decidindo onde ha formula e escapa so fora. Os
delimitadores nao sao tocados: o trecho atravessa inteiro e o LaTeX
renderiza display sozinho.

Abre formula so quando o cifrao nao vem precedido de R/r, nao vem
seguido de espaco, e existe fechamento adiante. As tres se completam --
a do espaco sozinha nao pega R\$5, e a ancora sozinha nao pega US\$ 40.

Dentro da formula so o % e escapado, e so quando nao vem ja precedido de
barra: \$50\\%\$ e formula plausivel e escapar de novo faria \\% virar
\\\\%.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 3: Fechar

- [ ] **Step 1: Cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='modules/caderno/latex/**/*.ts' src/modules/caderno
```

Esperado: ≥ 90% em statements no diretório `latex/`. Se ficar abaixo, acrescente teste — nunca um
`istanbul ignore`.

- [ ] **Step 2: Suíte inteira e build**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta
yarn build && ls dist/main.js && rm -rf dist
```

Esperado: tudo verde e `dist/main.js` na raiz. O `cartao-resposta` entra porque compartilha a config
de Jest e de build.

- [ ] **Step 3: Abrir o PR contra a branch da POC**

```bash
git push -u origin feature/caderno-01-escape-latex
gh pr create --base poc/caderno-overleaf \
  --title "[Caderno · Overleaf] Card 01 — escape LaTeX com matemática intacta" \
  --body "Duas funcoes puras, sem dependencia nova.

\`escapeLatex\` escapa treze caracteres em passada unica e nao sabe nada de matematica. Veio copiada byte-a-byte da branch do card 02 da POC anterior, onde passou por dois ciclos de review -- inclusive o achado da aspa dupla, que o babel[brazil] torna ativa: sem escapar, \\\"\\\" vira salto de largura zero e as aspas somem da prova.

\`escaparForaDaMatematica\` decide ONDE escapar. Abre formula so quando o cifrao nao vem precedido de R/r, nao vem seguido de espaco, e existe fechamento adiante. As tres condicoes se completam: a do espaco sozinha nao pega \`R\$5\`, e a ancora sozinha nao pega \`US\$ 40\`. A do fechamento impede um cifrao solto de engolir o escape do resto do texto.

Os delimitadores nao sao tocados -- diferente da POC anterior, onde o parser os removia e o handler tinha que reemitir (dai a discussao de \`\\\\[...\\\\]\`). Aqui o trecho atravessa inteiro.

Dentro da formula so o \`%\` e escapado, porque e comentario em qualquer modo -- e so quando nao vem ja precedido de barra, senao \`\$50\\\\%\$\` viraria \`\\\\\\\\%\`, quebra de linha seguida de comentario.

Limitacao conhecida e registrada: \`US\$40\` seguido de outro cifrao abre formula. Fechar isso significaria listar prefixos de moeda, e a lista nunca acaba.

Sem gate no Overleaf: a tabela de escape ja passou por compilacao real na POC anterior, e o que e novo aqui se verifica inspecionando a string. Um erro daqui aparece no gate do card 02, com um conteudo.tex de verdade -- teste melhor que qualquer coisa montada a mao.

Spec: docs/superpowers/specs/2026-09-07-caderno-overleaf-escape-latex-design.md
Plano: docs/superpowers/plans/2026-09-07-caderno-overleaf-escape-latex.md"
```

O `--base` é a POC, **não** a `develop`.

---

## Reflexos no próximo card

| Card | O que muda |
|---|---|
| 02 | Chama `escaparForaDaMatematica` em cada campo de texto da questão — `textoQuestao`, `pergunta`, `textoAlternativaA..E` — e no nome do simulado, para o `\def\cadernoTitulo` |
| 02 | Importa de `src/modules/caderno/latex/escapar-fora-da-matematica`. O `escapeLatex` também está exportado, mas o card 02 **não** deve usá-lo direto: usar o escaper puro num campo de questão apagaria a matemática |
