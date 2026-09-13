# Caderno — os dois logos no zip (ms-simulado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O zip do caderno passa a levar `logo_vnf.png` e `logo_cursinho.png`, recebidos do api no corpo de um POST, e o lint impede publicar template que os referencie sem guarda.

**Architecture:** O api resolve os bytes (ele é quem sabe quem pediu e tem os buckets) e manda em base64 sob chaves semânticas `vnf`/`cursinho`. Este serviço traduz essas chaves para nomes de arquivo na raiz plana do zip — quem manda os bytes não dita nome de arquivo. O `GET` atual fica vivo, gerando zip sem logos, para a janela de deploy entre os dois serviços.

**Tech Stack:** NestJS 10, Mongoose, JSZip, Jest.

**Spec:** `docs/superpowers/specs/2026-09-13-caderno-logos-no-zip-design.md`

**Rodar um teste só:** `npx jest --detectOpenHandles --forceExit <caminho>`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/caderno/templates.ts` (modificar) | ganha `NOMES_DOS_LOGOS` — o mapa chave semântica → nome no zip, ao lado de `ARQUIVOS_DO_REPO` |
| `src/modules/caderno/logos.ts` (criar) | o tipo `LogosDoCaderno` e a função pura que gera os avisos de logo ausente |
| `src/modules/caderno/zip.ts` (modificar) | escreve os logos presentes na raiz |
| `src/modules/caderno/caderno.service.ts` (modificar) | repassa `logos` e junta os avisos |
| `src/modules/caderno/dtos/logos.dto.input.ts` (criar) | valida o corpo do POST |
| `src/modules/caderno/caderno.controller.ts` (modificar) | rota POST nova, GET mantido |
| `src/modules/caderno/template/template-lint.ts` (modificar) | regra nova: logo referenciado sem `\IfFileExists` do mesmo nome |

`logos.ts` existe separado de `zip.ts` porque os avisos são regra de **domínio** (o que o coordenador precisa saber), não de empacotamento — e porque uma função pura é testável sem montar zip.

---

## Task 1: `NOMES_DOS_LOGOS` e o tipo `LogosDoCaderno`

**Files:**
- Modify: `src/modules/caderno/templates.ts`
- Create: `src/modules/caderno/logos.ts`
- Test: `src/modules/caderno/logos.spec.ts`

- [ ] **Step 1: Write the failing test**

Criar `src/modules/caderno/logos.spec.ts`:

```ts
import { NOMES_DOS_LOGOS } from './templates';
import { avisosDosLogos } from './logos';

describe('NOMES_DOS_LOGOS', () => {
  it('mapeia chave semântica para nome de arquivo na raiz do zip', () => {
    expect(NOMES_DOS_LOGOS).toEqual({
      vnf: 'logo_vnf.png',
      cursinho: 'logo_cursinho.png',
    });
  });

  it('não põe logo em subpasta — a raiz é plana', () => {
    for (const nome of Object.values(NOMES_DOS_LOGOS)) {
      expect(nome).not.toContain('/');
    }
  });
});

describe('avisosDosLogos', () => {
  it('não avisa nada quando os dois vieram', () => {
    expect(
      avisosDosLogos({ vnf: Buffer.from('a'), cursinho: Buffer.from('b') }),
    ).toEqual([]);
  });

  it('avisa o logo do cursinho ausente', () => {
    expect(avisosDosLogos({ vnf: Buffer.from('a') })).toEqual([
      'logo do cursinho não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('avisa o logo do VNF ausente', () => {
    expect(avisosDosLogos({ cursinho: Buffer.from('b') })).toEqual([
      'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('avisa os dois, VNF primeiro', () => {
    expect(avisosDosLogos({})).toEqual([
      'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
      'logo do cursinho não disponível — o cabeçalho sai sem a marca',
    ]);
  });

  it('trata `logos` ausente como os dois ausentes', () => {
    expect(avisosDosLogos(undefined)).toHaveLength(2);
  });

  // ⚠️ Quebra de linha dentro de um aviso encerra o comentário LaTeX e joga o
  // resto dentro do documento, impresso na prova.
  it('nenhum aviso tem quebra de linha', () => {
    for (const aviso of avisosDosLogos({})) {
      expect(aviso).not.toMatch(/[\r\n]/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/logos.spec.ts`
Expected: FAIL — `Cannot find module './logos'`.

- [ ] **Step 3: Write minimal implementation**

Acrescentar ao final de `src/modules/caderno/templates.ts`:

```ts
/**
 * Chave semântica → nome do arquivo na raiz do zip.
 *
 * ⚠️ **O mapa mora aqui, não no chamador.** O api manda `{ vnf, cursinho }`;
 * quem decide que `cursinho` vira `logo_cursinho.png` é este serviço, junto
 * com o resto do layout do zip. Deixar o chamador mandar o nome do arquivo
 * faria quem manda os bytes ditar a estrutura do pacote.
 *
 * ⚠️ Raiz plana, como os `ARQUIVOS_DO_REPO`: o `\includegraphics` do
 * `main.tex` resolve relativo a ele. `assets/` é a única subpasta, e é das
 * imagens das questões.
 */
export const NOMES_DOS_LOGOS = {
  vnf: 'logo_vnf.png',
  cursinho: 'logo_cursinho.png',
} as const;

export type ChaveDeLogo = keyof typeof NOMES_DOS_LOGOS;
```

Criar `src/modules/caderno/logos.ts`:

```ts
import { ChaveDeLogo } from './templates';

/**
 * Os logos que vieram do api, já decodificados.
 *
 * Chave ausente = aquele logo não existe para este download. É estado normal,
 * não erro: quem baixa pode não ter cursinho (o caderno é liberado por
 * `visualizarProvas`, que não exige cursinho nenhum) ou o cursinho pode não
 * ter logo cadastrado.
 */
export type LogosDoCaderno = Partial<Record<ChaveDeLogo, Buffer>>;

const TEXTO: Record<ChaveDeLogo, string> = {
  vnf: 'logo do Você na Facul não disponível — o cabeçalho sai sem a marca',
  cursinho: 'logo do cursinho não disponível — o cabeçalho sai sem a marca',
};

/**
 * Um aviso por logo ausente.
 *
 * Os avisos viram comentários `% AVISO:` no topo do `conteudo.tex`: invisíveis
 * no PDF, visíveis para quem abre no Overleaf. Sem eles, um cabeçalho sem a
 * marca do cursinho não tem explicação em lugar nenhum — e a pessoa vai
 * procurar o defeito no template.
 */
export function avisosDosLogos(logos: LogosDoCaderno | undefined): string[] {
  const presentes = logos ?? {};
  return (Object.keys(TEXTO) as ChaveDeLogo[])
    .filter((chave) => !presentes[chave])
    .map((chave) => TEXTO[chave]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/logos.spec.ts`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/templates.ts src/modules/caderno/logos.ts src/modules/caderno/logos.spec.ts
git commit -m "feat(caderno): mapa de nomes dos logos e avisos de logo ausente"
```

---

## Task 2: `montarZip` escreve os logos

**Files:**
- Modify: `src/modules/caderno/zip.ts`
- Test: `src/modules/caderno/zip.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescentar ao final de `src/modules/caderno/zip.spec.ts`:

```ts
describe('montarZip — logos', () => {
  const comLogos = (logos: Record<string, Buffer>) =>
    montarZip({
      template: TEMPLATE_FALSO,
      conteudo: '\\question Teste\n',
      metadados: '\\def\\cadernoTitulo{Teste}\n',
      imagens: [],
      logos,
    });

  it('escreve os dois logos na raiz, com os nomes de NOMES_DOS_LOGOS', async () => {
    const zip = await abrir(
      await comLogos({
        vnf: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        cursinho: Buffer.from([0x89, 0x50, 0x4e, 0x48]),
      }),
    );

    expect(zip.files['logo_vnf.png']).toBeDefined();
    expect(zip.files['logo_cursinho.png']).toBeDefined();
    expect(
      Buffer.from(await zip.files['logo_cursinho.png'].async('nodebuffer')),
    ).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x48]));
  });

  it('a ausência de um não impede o outro', async () => {
    const zip = await abrir(await comLogos({ vnf: Buffer.from([0x89]) }));

    expect(zip.files['logo_vnf.png']).toBeDefined();
    expect(zip.files['logo_cursinho.png']).toBeUndefined();
  });

  // ⚠️ É o caso do GET mantido e do usuário sem cursinho. Se isto quebrar, o
  // download some para quem não tem cursinho.
  it('sem logos nenhum, o zip continua válido', async () => {
    const zip = await abrir(await comLogos({}));

    expect(zip.files['main.tex']).toBeDefined();
    expect(zip.files['logo_vnf.png']).toBeUndefined();
    expect(zip.files['logo_cursinho.png']).toBeUndefined();
  });

  // ⚠️ O `logo.png` é de um template anterior e continua saindo do disco.
  // Não confundir com `logo_vnf.png`, que vem do BUCKET_HOME.
  it('não substitui o logo.png de ARQUIVOS_DO_REPO', async () => {
    const zip = await abrir(await comLogos({ vnf: Buffer.from([0x89]) }));

    expect(zip.files['logo.png']).toBeDefined();
    expect(ARQUIVOS_DO_REPO).toContain('logo.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/zip.spec.ts`
Expected: FAIL — erro de tipo em `logos` (propriedade não existe em `PacoteDoCaderno`) e `zip.files['logo_vnf.png']` indefinido.

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/caderno/zip.ts`, acrescentar aos imports:

```ts
import { LogosDoCaderno } from './logos';
import {
  ARQUIVOS_DO_REPO,
  ARQUIVOS_DO_TEMPLATE,
  ChaveDeLogo,
  NOMES_DOS_LOGOS,
  TEMPLATE_DIR,
} from './templates';
```

Acrescentar o campo à interface:

```ts
export interface PacoteDoCaderno {
  /** `main.tex` e `preambulo.tex`, da versão publicada no Mongo. */
  template: Record<string, string>;
  conteudo: string;
  metadados: string;
  imagens: ArquivoDoZip[];
  /**
   * Vêm do api, que é quem sabe de qual cursinho é quem pediu. Opcional: o
   * `GET` legado não manda nenhum, e chave ausente é estado normal.
   */
  logos?: LogosDoCaderno;
}
```

E, dentro de `montarZip`, logo depois do laço de `pacote.imagens`:

```ts
  for (const chave of Object.keys(NOMES_DOS_LOGOS) as ChaveDeLogo[]) {
    const buffer = pacote.logos?.[chave];
    if (buffer) zip.file(NOMES_DOS_LOGOS[chave], buffer);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/zip.spec.ts`
Expected: PASS — inclusive o teste antigo `tem raiz plana, com assets/ como única subpasta`, que lista os arquivos exatos e **não** deve mudar (aquele `pacote()` não passa `logos`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/zip.ts src/modules/caderno/zip.spec.ts
git commit -m "feat(caderno): montarZip escreve os logos recebidos na raiz"
```

---

## Task 3: `gerarZip` repassa os logos e junta os avisos

**Files:**
- Modify: `src/modules/caderno/caderno.service.ts:44-108`
- Test: `src/modules/caderno/caderno.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescentar ao final de `src/modules/caderno/caderno.service.spec.ts`. A fábrica local se chama `montar()` (definida na linha 32) e devolve `{ service, simuladoService, resolver, env, templateService }`. O id usado no arquivo é `'sim1'`. `JSZip` já está importado no topo.

```ts
describe('gerarZip — logos', () => {
  it('repassa os logos recebidos para o zip', async () => {
    const { service } = montar();
    const vnf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const r = await service.gerarZip('sim1', { draft: false, logos: { vnf } });

    const zip = await JSZip.loadAsync(r.buffer);
    expect(zip.file('logo_vnf.png')).not.toBeNull();
  });

  it('logo ausente vira aviso e entra na contagem', async () => {
    const { service } = montar();

    const r = await service.gerarZip('sim1', {
      draft: false,
      logos: { vnf: Buffer.from([0x89]) },
    });

    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');

    expect(conteudo).toContain(
      '% AVISO: logo do cursinho não disponível — o cabeçalho sai sem a marca',
    );
    expect(conteudo).not.toContain('% AVISO: logo do Você na Facul');
  });

  // ⚠️ É a chamada do GET legado. Não pode lançar.
  it('sem a opção `logos`, gera o zip e avisa os dois', async () => {
    const { service } = montar();

    const r = await service.gerarZip('sim1', { draft: false });

    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');

    expect(zip.file('main.tex')).not.toBeNull();
    expect(conteudo).toContain('% AVISO: logo do Você na Facul não disponível');
    expect(conteudo).toContain('% AVISO: logo do cursinho não disponível');
  });

  // ⚠️ O invariante que o teste `junta os avisos dos dois cards` já afere:
  // toda linha `% AVISO:` conta no header. Os avisos de logo não podem
  // escapar dessa conta.
  it('os avisos de logo entram na contagem do header', async () => {
    const { service } = montar();

    const r = await service.gerarZip('sim1', { draft: false });

    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');
    const linhas = conteudo
      .split('\n')
      .filter((l: string) => l.startsWith('% AVISO:'));

    expect(linhas.length).toBe(r.avisos);
  });
});
```

⚠️ **O teste existente `junta os avisos dos dois cards e conta o total` (linha 176) continua passando**: ele afere `linhas.length === r.avisos`, que é relacional — os dois lados crescem juntos. Mas o comentário dele (`// 5 alternativas em branco (card 02) + 1 imagem (card 03)`) fica desatualizado. Atualizar para `// 5 alternativas em branco (card 02) + 1 imagem (card 03) + 2 logos (card 13)` no mesmo passo.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.service.spec.ts`
Expected: FAIL — `logos` não existe no tipo de `opts`, e nenhum aviso de logo no `conteudo.tex`.

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/caderno/caderno.service.ts`, acrescentar ao import block:

```ts
import { avisosDosLogos, LogosDoCaderno } from './logos';
```

Mudar a assinatura de `gerarZip`:

```ts
  async gerarZip(
    simuladoId: string,
    opts: { draft: boolean; logos?: LogosDoCaderno },
  ): Promise<{ nome: string; buffer: Buffer; avisos: number }> {
```

Trocar o bloco `juntarAvisos.comTotal` (hoje em `:81-84`) por:

```ts
    // ⚠️ Os avisos dos logos entram JUNTO com os das imagens, na mesma
    // chamada. Chamar `comTotal` duas vezes contaria o primeiro lote duas
    // vezes: ele reencontra os `% AVISO:` que já escreveu e os soma de novo.
    const { conteudo, total } = juntarAvisos.comTotal(caderno.conteudo, [
      ...resolucao.avisos,
      ...avisosDosLogos(opts.logos),
    ]);
```

E passar os logos ao `montarZip` (hoje em `:86-91`):

```ts
    const buffer = await montarZip({
      template: templatePublicado.arquivos,
      conteudo,
      metadados: caderno.metadados,
      imagens: resolucao.arquivos,
      logos: opts.logos,
    });
```

Acrescentar ao `logger.log` existente, antes de `bytes=`:

```ts
        `logos=${Object.keys(opts.logos ?? {}).length} ` +
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/caderno.service.ts src/modules/caderno/caderno.service.spec.ts
git commit -m "feat(caderno): gerarZip repassa os logos e avisa os ausentes"
```

---

## Task 4: DTO do corpo do POST

**Files:**
- Create: `src/modules/caderno/dtos/logos.dto.input.ts`
- Test: `src/modules/caderno/dtos/logos.dto.input.spec.ts`

- [ ] **Step 1: Write the failing test**

Criar `src/modules/caderno/dtos/logos.dto.input.spec.ts`:

```ts
import { decodificarLogos } from './logos.dto.input';

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');

describe('decodificarLogos', () => {
  it('decodifica as duas chaves', () => {
    const logos = decodificarLogos({ vnf: PNG_B64, cursinho: PNG_B64 });

    expect(logos.vnf).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(logos.cursinho).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('chave ausente fica ausente', () => {
    expect(decodificarLogos({ vnf: PNG_B64 })).toEqual({
      vnf: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
  });

  // ⚠️ O api sempre omite a chave; tolerar `null` é para quem escrever outro
  // cliente depois não descobrir a diferença em produção.
  it('tolera null explícito', () => {
    expect(decodificarLogos({ vnf: PNG_B64, cursinho: null })).toEqual({
      vnf: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
  });

  it('corpo ausente vira objeto vazio', () => {
    expect(decodificarLogos(undefined)).toEqual({});
  });

  it('ignora chave desconhecida', () => {
    expect(
      decodificarLogos({ vnf: PNG_B64, qualquer: PNG_B64 } as never),
    ).toEqual({ vnf: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  });

  it('base64 inválido vira ausência, não exceção', () => {
    expect(decodificarLogos({ cursinho: '!!! não é base64 !!!' })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/dtos/logos.dto.input.spec.ts`
Expected: FAIL — `Cannot find module './logos.dto.input'`.

- [ ] **Step 3: Write minimal implementation**

Criar `src/modules/caderno/dtos/logos.dto.input.ts`:

```ts
import { IsBase64, IsOptional, IsString } from 'class-validator';
import { LogosDoCaderno } from '../logos';
import { ChaveDeLogo, NOMES_DOS_LOGOS } from '../templates';

export class LogosDtoInput {
  @IsOptional()
  @IsString()
  @IsBase64()
  vnf?: string | null;

  @IsOptional()
  @IsString()
  @IsBase64()
  cursinho?: string | null;
}

export class CadernoDtoInput {
  @IsOptional()
  logos?: LogosDtoInput;
}

/**
 * Base64 → Buffer, chave a chave.
 *
 * ⚠️ **Base64 inválido vira ausência, não exceção.** Recusar a requisição
 * inteira por causa de um logo ilegível derrubaria a geração da prova — e o
 * caminho de ausência já existe e já avisa. O `@IsBase64` do DTO é que reporta
 * a malformação como 400 quando o `ValidationPipe` está ligado; isto aqui é a
 * rede embaixo.
 *
 * ⚠️ Só as chaves de `NOMES_DOS_LOGOS` atravessam. Um corpo com chave extra
 * não vira arquivo no zip.
 */
export function decodificarLogos(
  corpo: LogosDtoInput | undefined,
): LogosDoCaderno {
  const logos: LogosDoCaderno = {};
  if (!corpo) return logos;

  for (const chave of Object.keys(NOMES_DOS_LOGOS) as ChaveDeLogo[]) {
    const valor = corpo[chave];
    if (typeof valor !== 'string' || valor.length === 0) continue;

    const buffer = Buffer.from(valor, 'base64');
    // `Buffer.from` nunca lança em base64 inválido: ele descarta o que não
    // reconhece. Zero byte é o sinal de que não sobrou nada.
    if (buffer.length > 0) logos[chave] = buffer;
  }

  return logos;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/dtos/logos.dto.input.spec.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/dtos/
git commit -m "feat(caderno): DTO e decodificacao do corpo com os logos"
```

---

## Task 5: rota POST no controller, GET mantido

**Files:**
- Modify: `src/modules/caderno/caderno.controller.ts`
- Test: `src/modules/caderno/caderno.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescentar ao final de `src/modules/caderno/caderno.controller.spec.ts`. A fábrica local se chama `montar()` (linha 3) e devolve `{ controller, service, res }`, com `res = { set: jest.fn() }`. O id usado no arquivo é `'sim1'`.

```ts
describe('POST :simuladoId — com logos', () => {
  const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it('decodifica o corpo e repassa os buffers ao serviço', async () => {
    const { controller, service, res } = montar();

    await controller.postCaderno(
      'sim1',
      undefined,
      { logos: { vnf: PNG_B64, cursinho: PNG_B64 } },
      res as any,
    );

    expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
      draft: false,
      logos: { vnf: PNG, cursinho: PNG },
    });
  });

  it('corpo sem logos chega como objeto vazio, não undefined', async () => {
    const { controller, service, res } = montar();

    await controller.postCaderno('sim1', undefined, {}, res as any);

    expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
      draft: false,
      logos: {},
    });
  });

  it('respeita o draft=true, igual ao GET', async () => {
    const { controller, service, res } = montar();

    await controller.postCaderno('sim1', 'true', {}, res as any);

    expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
      draft: true,
      logos: {},
    });
  });

  it('manda os mesmos headers que o GET', async () => {
    const { controller, res } = montar();

    await controller.postCaderno('sim1', undefined, {}, res as any);

    expect(res.set).toHaveBeenCalledWith({
      'Content-Disposition': 'attachment; filename="prova-20260908-1432.zip"',
      'X-Caderno-Avisos': '3',
    });
  });
});

// ⚠️ O GET é o que segura a janela de deploy: se ele sumir antes de o api
// subir, todo download de caderno morre em 404.
describe('GET :simuladoId — mantido para a janela de deploy', () => {
  it('continua gerando, sem a chave logos', async () => {
    const { controller, service, res } = montar();

    await controller.getCaderno('sim1', undefined, res as any);

    expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: false });
  });
});
```

⚠️ Os quatro testes existentes do arquivo chamam `controller.getCaderno(...)` e asseram `gerarZip` com `{ draft: … }` exato. O `getCaderno` **não muda** nesta task, então eles continuam passando sem edição.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.controller.spec.ts`
Expected: FAIL — `controller.postCaderno is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/caderno/caderno.controller.ts`, acrescentar `Body` e `Post` ao import de `@nestjs/common`, e os dois imports do DTO:

```ts
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { CadernoDtoInput, decodificarLogos } from './dtos/logos.dto.input';
```

Acrescentar o método, **depois** do `getCaderno` existente:

```ts
  /**
   * A rota que o api usa desde o card 13.
   *
   * ⚠️ **O `GET` acima continua existindo, e não é sobra.** Os dois serviços
   * sobem em deploys separados: se o api subisse antes mandando POST, todo
   * download de caderno morreria em 404 até o segundo deploy terminar. Com o
   * GET vivo, qualquer ordem funciona e o pior caso é um caderno sem logos por
   * alguns minutos. Remover é card próprio, depois dos dois em produção.
   *
   * ⚠️ Mesma restrição de param do GET, pelo mesmo motivo: sem ela o literal
   * `template` das rotas do `CadernoTemplateController` casa aqui.
   */
  @Post(':simuladoId([0-9a-fA-F]{24})')
  @Header('Content-Type', 'application/zip')
  async postCaderno(
    @Param('simuladoId') simuladoId: string,
    @Query('draft') draft: string | undefined,
    @Body() corpo: CadernoDtoInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { nome, buffer, avisos } = await this.caderno.gerarZip(simuladoId, {
      draft: draft === 'true',
      logos: decodificarLogos(corpo?.logos),
    });

    res.set({
      'Content-Disposition': `attachment; filename="${nome}"`,
      'X-Caderno-Avisos': String(avisos),
    });

    return new StreamableFile(buffer);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/caderno.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/caderno.controller.ts src/modules/caderno/caderno.controller.spec.ts
git commit -m "feat(caderno): rota POST que recebe os logos, GET mantido"
```

---

## Task 6: regra de lint — logo sem `\IfFileExists` reprova

**Files:**
- Modify: `src/modules/caderno/template/template-lint.ts`
- Test: `src/modules/caderno/template/template-lint.spec.ts`

- [ ] **Step 1: Write the failing test**

Acrescentar ao final de `src/modules/caderno/template/template-lint.spec.ts`. O template mínimo válido do arquivo se chama `OK` (linha 6).

```ts
describe('lintarTemplate — logos precisam de guarda', () => {
  const comPreambulo = (trecho: string) =>
    lintarTemplate({
      ...OK,
      'preambulo.tex': `${OK['preambulo.tex']}\n${trecho}\n`,
    });

  it('reprova \\includegraphics de logo_cursinho.png sem guarda', () => {
    const r = comPreambulo('\\includegraphics[height=1.1cm]{logo_cursinho.png}');

    expect(r.podePublicar).toBe(false);
    expect(r.erros.join('\n')).toContain('logo_cursinho.png');
    expect(r.erros.join('\n')).toContain('IfFileExists');
  });

  it('reprova \\includegraphics de logo_vnf.png sem guarda', () => {
    const r = comPreambulo('\\includegraphics{logo_vnf.png}');

    expect(r.podePublicar).toBe(false);
    expect(r.erros.join('\n')).toContain('logo_vnf.png');
  });

  it('aceita quando guardado pelo IfFileExists do mesmo arquivo', () => {
    const r = comPreambulo(
      '\\IfFileExists{logo_vnf.png}{\\includegraphics{logo_vnf.png}}{}',
    );

    expect(r.erros.join('\n')).not.toContain('logo_vnf.png');
  });

  // ⚠️ O caso que motiva a regra ser por arquivo: guardar um e desenhar o
  // outro compila quando os dois vêm e quebra quando falta só o segundo.
  it('reprova guarda de um arquivo protegendo o includegraphics do outro', () => {
    const r = comPreambulo(
      '\\IfFileExists{logo_vnf.png}{\\includegraphics{logo_cursinho.png}}{}',
    );

    expect(r.podePublicar).toBe(false);
    expect(r.erros.join('\n')).toContain('logo_cursinho.png');
  });

  it('não se mete com imagem que não é logo', () => {
    const r = comPreambulo('\\includegraphics{assets/01.png}');

    expect(r.erros.join('\n')).not.toContain('IfFileExists');
  });

  // O template do repo já guarda o logo.png (preambulo.tex:86) — a regra não
  // se aplica a ele, que vem sempre do disco.
  it('não exige guarda para o logo.png dos ARQUIVOS_DO_REPO', () => {
    const r = comPreambulo('\\includegraphics{logo.png}');

    expect(r.erros.join('\n')).not.toContain('IfFileExists');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/template/template-lint.spec.ts`
Expected: FAIL — `podePublicar` vem `true` e os erros não mencionam `IfFileExists`.

- [ ] **Step 3: Write minimal implementation**

Em `src/modules/caderno/template/template-lint.ts`, acrescentar depois de `PUXA_ARQUIVO`:

```ts
/**
 * Os logos que podem faltar no zip.
 *
 * ⚠️ **Não inclui `logo.png`**, que sai sempre de `ARQUIVOS_DO_REPO` e nunca
 * falta. A regra é sobre arquivo que pode não vir: quem baixa o caderno pode
 * não ter cursinho, e o logo do VNF depende de o `BUCKET_HOME` responder.
 */
const LOGOS_OPCIONAIS = ['logo_vnf.png', 'logo_cursinho.png'];

const DESENHA_LOGO =
  /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{\s*([^}]*?)\s*\}/g;

/**
 * `\includegraphics` de logo opcional que não está dentro de um
 * `\IfFileExists` **do mesmo nome de arquivo**.
 *
 * ⚠️ **Mesmo nome, não "algum IfFileExists por perto".** Um
 * `\IfFileExists{logo_vnf.png}{...\includegraphics{logo_cursinho.png}...}`
 * compila quando os dois vêm e quebra exatamente no caso que a guarda deveria
 * cobrir. A ausência é por arquivo, então o critério é por arquivo.
 *
 * ⚠️ A checagem é por **linha**, que é onde o padrão do `preambulo.tex` já
 * põe as duas coisas (`linha 86`). Um `\IfFileExists` aberto numa linha e o
 * `\includegraphics` três linhas abaixo é reprovado — falso positivo aceito,
 * porque a alternativa é casar chaves balanceadas em LaTeX, e a mensagem de
 * erro diz o que fazer.
 */
function logosSemGuarda(arquivo: Arquivo): string[] {
  const achados: string[] = [];

  arquivo.texto.split('\n').forEach((linha, i) => {
    for (const [alvo] of matches(linha, DESENHA_LOGO)) {
      if (!LOGOS_OPCIONAIS.includes(alvo)) continue;

      const guarda = new RegExp(
        `\\\\IfFileExists\\s*\\{\\s*${alvo.replace(/\./g, '\\.')}\\s*\\}`,
      );
      if (guarda.test(linha)) continue;

      achados.push(
        `${onde(arquivo, i + 1)}: \`\\includegraphics{${alvo}}\` sem ` +
          `\`\\IfFileExists{${alvo}}\` na mesma linha — este arquivo pode não ` +
          `vir no zip (quem baixa pode não ter cursinho), e sem a guarda a ` +
          `compilação quebra no Overleaf`,
      );
    }
  });

  return achados;
}
```

E acrescentar a chamada no laço de regras de conteúdo do `lintarTemplate`, junto das outras que empurram para `erros`:

```ts
  for (const arquivo of limpos) {
    erros.push(...proibidos(arquivo));
    erros.push(...ambientesDesbalanceados(arquivo));
    erros.push(...logosSemGuarda(arquivo));
    avisos.push(...chavesDesbalanceadas(arquivo));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --detectOpenHandles --forceExit src/modules/caderno/template/template-lint.spec.ts`
Expected: PASS — 6 testes novos, e os antigos continuam passando.

- [ ] **Step 5: Commit**

```bash
git add src/modules/caderno/template/template-lint.ts src/modules/caderno/template/template-lint.spec.ts
git commit -m "feat(caderno): lint reprova logo opcional sem IfFileExists"
```

---

## Task 7: suíte inteira e lint do repo

**Files:** nenhum novo.

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm run test`
Expected: PASS. Atenção especial a `zip.spec.ts` (a lista exata de arquivos do teste antigo não pode ter mudado) e a `caderno-template.e2e-spec.ts`.

- [ ] **Step 2: Rodar o e2e**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erro novo. Comparar com a develop se aparecer algo.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: compila.

- [ ] **Step 5: Commit se houver ajuste**

```bash
git add -u
git commit -m "chore(caderno): ajustes da suite completa"
```

---

## Verificação manual antes do PR

O template publicado no Mongo **não é legível daqui**. Antes de abrir o PR, conferir com `clone:env`:

1. A versão publicada referencia `logo_vnf.png` e `logo_cursinho.png`?
2. Os `\includegraphics` deles já estão dentro de `\IfFileExists` do mesmo nome?

Se a resposta a (2) for não, o template publicado **vai reprovar na próxima publicação** depois da Task 6. Isso não quebra os cadernos já gerados nem a geração (o lint roda ao publicar, não ao gerar), mas quem for publicar precisa ajustar o template antes. Anexar o resultado da conferência ao PR.
