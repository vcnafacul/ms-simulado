# Caderno · Overleaf — Card 03: imagens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a lista de `ImagemRef` do card 02 nos arquivos que vão no zip — buscando no nosso R2, na internet, ou devolvendo um placeholder visível quando nada der certo.

**Architecture:** Um serviço Nest (`ResolverDeImagens`) que faz I/O, sentado sobre quatro módulos puros e testáveis sem rede: reconhecimento de formato, defesa de endereço, busca HTTP e cache no R2.

**Tech Stack:** TypeScript (CommonJS), Jest 29, `@aws-sdk/client-s3` (já presente), `node:dns`, `node:crypto`, `fetch` global do Node 20. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-08-caderno-overleaf-imagens-design.md`

---

## Contexto que o plano assume

**O card 02 já decidiu de onde cada imagem vem.** Ele entrega `ImagemRef[]`:

```ts
type ImagemRef =
  | { origem: 'r2'; key: string; arquivo: string }
  | { origem: 'url'; url: string; arquivo: string };
```

**URL externa é ~100% do acervo.** Não é caso de borda.

**Este card faz I/O**, diferente dos cards 01 e 02. É a fronteira onde o gerador puro encosta no mundo,
e é onde mora a defesa contra requisição de saída a partir de texto de questão.

**Não existe distribuição TeX nesta máquina.** Nunca tente compilar. O gate é manual (Task 9) e para
esperando o usuário.

⚠️ **Nenhum teste pode fazer chamada de rede real nem falar com R2 de verdade.** Mock de `fetch`,
`dns.lookup` e `StorageService`.

## Restrições do repo

- ⚠️ **Nunca** `yarn lint` nem `npx eslint <diretório>`: reformata arquivos não relacionados. Sempre caminhos explícitos.
- ⚠️ **Nunca** `git add -A` nem `git add .`.
- Jest: `npx jest --detectOpenHandles --forceExit <caminho>`
- Branch `feature/caderno-03-imagens`, já criada. Commits autônomos liberados.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/storage/storage.service.ts` | **modificado**: bucket opcional em `get`/`exists`/`putObject` |
| `src/shared/modules/env/env.ts` | **modificado**: `QUESTAO_BUCKET` |
| `src/modules/caderno/imagens/tipos.ts` | `ArquivoDoZip`, `ResultadoDaResolucao`, `FalhaDeImagem` |
| `src/modules/caderno/imagens/formato.ts` | magic bytes → extensão; recusa o que o pdflatex não inclui |
| `src/modules/caderno/imagens/endereco-seguro.ts` | DNS + faixas privadas |
| `src/modules/caderno/imagens/buscador-http.ts` | fetch com timeout, teto e redirect manual |
| `src/modules/caderno/imagens/cache-r2.ts` | `caderno-cache/<sha256 da url>` |
| `src/modules/caderno/imagens/resolver.ts` | o serviço Nest que orquestra |
| `src/modules/caderno/imagens/imagem-indisponivel.png` | o placeholder |

---

### Task 1: `StorageService` parametrizado e `QUESTAO_BUCKET`

**Files:**
- Modify: `src/shared/storage/storage.service.ts`
- Modify: `src/shared/modules/env/env.ts`
- Modify: `.env.example`
- Create: `src/shared/storage/storage.service.spec.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/shared/storage/storage.service.spec.ts`:

```ts
import { StorageService } from './storage.service';

/**
 * O cartão-resposta é a rede de segurança desta mudança: ele chama
 * `get`/`exists`/`putObject` sem bucket e não pode nem perceber que o
 * parâmetro existe.
 */
describe('StorageService — bucket opcional', () => {
  const env = {
    get: (chave: string) =>
      ({
        AWS_ENDPOINT: 'http://localhost:9000',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'k',
        AWS_SECRET_ACCESS_KEY: 's',
        CARTAO_BUCKET: 'bucket-do-cartao',
      })[chave],
  } as any;

  const capturarBucket = (service: StorageService) => {
    const enviados: string[] = [];
    (service as any).client = {
      send: (comando: any) => {
        enviados.push(comando.input.Bucket);
        return Promise.resolve({
          Body: { transformToByteArray: async () => new Uint8Array([1]) },
        });
      },
    };
    return enviados;
  };

  it('sem bucket, usa o CARTAO_BUCKET', async () => {
    const service = new StorageService(env);
    const enviados = capturarBucket(service);
    await service.get('k1');
    await service.exists('k2');
    await service.putObject('k3', Buffer.from('x'), 'image/png');
    expect(enviados).toEqual([
      'bucket-do-cartao',
      'bucket-do-cartao',
      'bucket-do-cartao',
    ]);
  });

  it('com bucket, usa o que foi passado', async () => {
    const service = new StorageService(env);
    const enviados = capturarBucket(service);
    await service.get('k1', 'outro-bucket');
    await service.putObject('k2', Buffer.from('x'), 'image/png', 'outro-bucket');
    expect(enviados).toEqual(['outro-bucket', 'outro-bucket']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/shared/storage/storage.service.spec.ts
```

Esperado: FAIL — `get` ainda não aceita segundo argumento (erro de tipo) ou o segundo teste recebe
`bucket-do-cartao`.

- [ ] **Step 3: Implementar**

Em `storage.service.ts`, acrescente um resolvedor e passe-o em cada comando:

```ts
  /**
   * O bucket de cada chamada. Omitido, cai no `CARTAO_BUCKET` — o único que
   * este serviço conhecia antes, e é o que garante zero regressão no
   * cartão-resposta.
   */
  private bucketDe(bucket?: string): string {
    return bucket ?? this.bucket;
  }
```

e troque as três assinaturas:

```ts
  async exists(key: string, bucket?: string): Promise<boolean>
  async get(key: string, bucket?: string): Promise<Buffer>
  async putObject(key, body, contentType, bucket?): Promise<void>
```

usando `Bucket: this.bucketDe(bucket)` em cada `Command`.

Em `env.ts`, acrescente ao schema:

```ts
  // Bucket das imagens de questão (Caderno · card 03). SEM default: um
  // default silencioso apontaria para o bucket errado, e a falha apareceria
  // como "imagem não encontrada" — o sintoma mais confuso possível.
  // Credencial de LEITURA APENAS neste bucket.
  QUESTAO_BUCKET: z.string().optional(),
```

Em `.env.example`, abaixo do bloco do cartão:

```
# Imagens de questão (Caderno · card 03) — leitura apenas
QUESTAO_BUCKET=simulado-questoes
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/shared/storage/storage.service.spec.ts
npx jest --detectOpenHandles --forceExit src/modules/cartao-resposta
```

Esperado: PASS nos dois. **A suíte do cartão-resposta tem que passar sem uma linha alterada** — é o
critério de "zero regressão".

- [ ] **Step 5: Provar que o default morde**

Troque `bucket ?? this.bucket` por `bucket!` e confirme que `sem bucket, usa o CARTAO_BUCKET` fica
vermelho. Restaure.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/shared/storage/storage.service.ts src/shared/storage/storage.service.spec.ts src/shared/modules/env/env.ts
npx eslint src/shared/storage/storage.service.ts src/shared/storage/storage.service.spec.ts src/shared/modules/env/env.ts
git add src/shared/storage/storage.service.ts src/shared/storage/storage.service.spec.ts src/shared/modules/env/env.ts .env.example
git commit -m "$(cat <<'EOF'
feat(storage): bucket opcional em get/exists/putObject

Omitido, cai no CARTAO_BUCKET -- zero regressao no cartao-resposta, cuja
suite passa sem uma linha alterada.

QUESTAO_BUCKET entra SEM default: um default silencioso apontaria pro
bucket errado e a falha apareceria como "imagem nao encontrada", o
sintoma mais confuso possivel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 2: `formato.ts` — os bytes mandam

**Files:**
- Create: `src/modules/caderno/imagens/tipos.ts`
- Create: `src/modules/caderno/imagens/formato.spec.ts`
- Create: `src/modules/caderno/imagens/formato.ts`

- [ ] **Step 1: Escrever os tipos**

`src/modules/caderno/imagens/tipos.ts`:

```ts
/** Um arquivo pronto para entrar no zip. */
export interface ArquivoDoZip {
  /**
   * Caminho dentro do zip, **com** extensão: `assets/01.jpeg`.
   *
   * ⚠️ Não confundir com `ImagemRef.arquivo` do card 02, que é a referência
   * **sem** extensão (`assets/01`) escrita no `.tex`. São coisas diferentes, e
   * confundi-las é exatamente como a extensão erra.
   */
  nome: string;
  buffer: Buffer;
}

export interface ResultadoDaResolucao {
  arquivos: ArquivoDoZip[];
  avisos: string[];
  metricas: {
    doCache: number;
    doBucket: number;
    daInternet: number;
    falhas: number;
    bytes: number;
    ms: number;
  };
}
```

- [ ] **Step 2: Escrever o teste que falha**

`src/modules/caderno/imagens/formato.spec.ts`:

```ts
import { extensaoDosBytes } from './formato';

const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pdf = () => Buffer.from('%PDF-1.7\n');
const gif = () => Buffer.from('GIF89a');
const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP'),
  ]);

describe('extensaoDosBytes — o que o pdflatex inclui', () => {
  it('reconhece PNG, JPEG e PDF', () => {
    expect(extensaoDosBytes(png())).toBe('png');
    expect(extensaoDosBytes(jpeg())).toBe('jpeg');
    expect(extensaoDosBytes(pdf())).toBe('pdf');
  });
});

describe('extensaoDosBytes — o que ele NÃO inclui', () => {
  it('recusa GIF e WEBP', () => {
    // O pdflatex não inclui nenhum dos dois. Deixar passar produziria um
    // arquivo válido com nome plausível que quebra a compilação — pior que
    // recusar, porque o defeito aparece longe da causa.
    expect(extensaoDosBytes(gif())).toBeNull();
    expect(extensaoDosBytes(webp())).toBeNull();
  });

  it('recusa bytes que não casam nada', () => {
    expect(extensaoDosBytes(Buffer.from('não sou imagem nenhuma'))).toBeNull();
  });
});

describe('extensaoDosBytes — bordas', () => {
  it('não estoura com buffer curto demais para a assinatura', () => {
    expect(extensaoDosBytes(Buffer.alloc(0))).toBeNull();
    expect(extensaoDosBytes(Buffer.from([0x89]))).toBeNull();
    expect(extensaoDosBytes(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(extensaoDosBytes(Buffer.from('RIFF'))).toBeNull();
  });

  it('não confunde RIFF que não é WEBP', () => {
    // RIFF é contêiner genérico (WAV também é RIFF). Só os 4 bytes iniciais
    // não bastam para dizer que é WEBP — e nem WEBP nós aceitamos, mas o
    // reconhecimento precisa ser correto para o aviso dizer a verdade.
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WAVE'),
    ]);
    expect(extensaoDosBytes(wav)).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/formato.spec.ts
```

Esperado: FAIL — `Cannot find module './formato'`.

- [ ] **Step 4: Implementar**

`src/modules/caderno/imagens/formato.ts`:

```ts
/**
 * Reconhece o formato pelos **magic bytes**, não pelo nome do arquivo.
 *
 * O nome vem do path de uma URL de terceiro e mente com frequência: um `.png`
 * que serve JPEG faz o `graphicx` escolher o driver errado e a figura falha.
 * Os bytes não mentem.
 *
 * ⚠️ **O pdflatex inclui PNG, JPEG e PDF. Não inclui GIF nem WEBP.** Uma
 * imagem nesses formatos falharia mesmo com a extensão correta, então é
 * recusada como qualquer outra falha — melhor um marcador visível na prova do
 * que um erro de compilação que ninguém liga à questão que o causou.
 */

const comeca = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length &&
  bytes.every((byte, i) => buffer[i] === byte);

/** A extensão do formato, ou `null` se não for algo que o pdflatex inclua. */
export function extensaoDosBytes(buffer: Buffer): string | null {
  if (comeca(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (comeca(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (comeca(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  return null;
}
```

⚠️ GIF e WEBP não aparecem no código: não são reconhecidos, apenas não casam, e caem no `null`. Os
testes deles existem para travar o comportamento, não porque haja um ramo.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/formato.spec.ts
```

Esperado: PASS, 5 testes.

- [ ] **Step 6: (corrigido) a checagem de tamanho é redundante, e o teste prova isso**

⚠️ A versão anterior deste passo mandava provar que a guarda `buffer.length >= bytes.length` morde.
**Ela não morde**, e a premissa estava errada: `buffer[i]` fora do fim devolve `undefined`, e
`undefined === <byte>` já é `false`, então o `every` sozinho recusa buffer curto.

Confirme, para o registro: troque `buffer.length >= bytes.length &&` por `true &&` e verifique que os
5 testes **continuam verdes**. Restaure.

A guarda fica no código como sinal de intenção, com um comentário dizendo que é redundante — porque um
guard que parece load-bearing e não é engana o próximo leitor.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/modules/caderno/imagens/tipos.ts src/modules/caderno/imagens/formato.ts src/modules/caderno/imagens/formato.spec.ts
npx eslint src/modules/caderno/imagens/tipos.ts src/modules/caderno/imagens/formato.ts src/modules/caderno/imagens/formato.spec.ts
git add src/modules/caderno/imagens/tipos.ts src/modules/caderno/imagens/formato.ts src/modules/caderno/imagens/formato.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): reconhecer formato pelos magic bytes

O nome vem do path de uma URL de terceiro e mente: um .png servindo JPEG
faz o graphicx escolher o driver errado e a figura falha.

pdflatex inclui PNG, JPEG e PDF -- NAO inclui GIF nem WEBP. Esses sao
recusados, porque falhariam mesmo com a extensao certa, e um erro de
compilacao longe da causa e pior que um marcador visivel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 3: `endereco-seguro.ts` — a defesa

**Files:**
- Create: `src/modules/caderno/imagens/endereco-seguro.spec.ts`
- Create: `src/modules/caderno/imagens/endereco-seguro.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/imagens/endereco-seguro.spec.ts`:

```ts
import { ehPrivado, verificarEndereco } from './endereco-seguro';

describe('ehPrivado — IPv4', () => {
  it('recusa o endereço de metadata da nuvem', () => {
    // 169.254.169.254 é o alvo clássico de SSRF: devolve credenciais da
    // instância em AWS, GCP, Azure e afins, sem autenticação nenhuma.
    expect(ehPrivado('169.254.169.254')).toBe(true);
  });

  it('recusa as faixas privadas da RFC 1918', () => {
    expect(ehPrivado('10.0.0.1')).toBe(true);
    expect(ehPrivado('172.16.0.1')).toBe(true);
    expect(ehPrivado('172.31.255.255')).toBe(true);
    expect(ehPrivado('192.168.1.1')).toBe(true);
  });

  it('recusa loopback, "este host" e broadcast', () => {
    expect(ehPrivado('127.0.0.1')).toBe(true);
    expect(ehPrivado('0.0.0.0')).toBe(true);
    expect(ehPrivado('255.255.255.255')).toBe(true);
  });

  it('recusa CGNAT', () => {
    // 100.64.0.0/10. Comum em rede de provedor e em algumas nuvens.
    expect(ehPrivado('100.64.0.1')).toBe(true);
    expect(ehPrivado('100.127.255.255')).toBe(true);
  });

  it('aceita endereço público, inclusive vizinho das faixas', () => {
    expect(ehPrivado('8.8.8.8')).toBe(false);
    expect(ehPrivado('1.1.1.1')).toBe(false);
    // 172.15 e 172.32 estão FORA da faixa privada, que é só 172.16–172.31.
    expect(ehPrivado('172.15.0.1')).toBe(false);
    expect(ehPrivado('172.32.0.1')).toBe(false);
    // 100.63 e 100.128 estão fora do CGNAT.
    expect(ehPrivado('100.63.255.255')).toBe(false);
    expect(ehPrivado('100.128.0.1')).toBe(false);
    // 169.253 e 169.255 estão fora do link-local.
    expect(ehPrivado('169.253.0.1')).toBe(false);
  });
});

describe('ehPrivado — IPv6', () => {
  it('recusa loopback, ULA e link-local', () => {
    expect(ehPrivado('::1')).toBe(true);
    expect(ehPrivado('fc00::1')).toBe(true);
    expect(ehPrivado('fd12:3456::1')).toBe(true);
    expect(ehPrivado('fe80::1')).toBe(true);
  });

  it('recusa IPv4 embrulhado em IPv6', () => {
    // ::ffff:169.254.169.254 chega ao mesmo lugar por outro caminho.
    expect(ehPrivado('::ffff:169.254.169.254')).toBe(true);
    expect(ehPrivado('::ffff:10.0.0.1')).toBe(true);
  });

  it('aceita IPv6 público', () => {
    expect(ehPrivado('2001:4860:4860::8888')).toBe(false);
  });
});

describe('verificarEndereco', () => {
  const comDns = (mapa: Record<string, string[]>) => (host: string) => {
    const ips = mapa[host];
    if (!ips) return Promise.reject(new Error('ENOTFOUND'));
    return Promise.resolve(ips.map((address) => ({ address, family: 4 })));
  };

  it('aceita host que resolve só para IP público', async () => {
    const r = await verificarEndereco(
      'https://enem.dev/a/b.png',
      comDns({ 'enem.dev': ['104.21.0.1'] }) as any,
    );
    expect(r).toEqual({ ok: true });
  });

  it('recusa host que resolve para IP privado', async () => {
    const r = await verificarEndereco(
      'http://interno.exemplo/a.png',
      comDns({ 'interno.exemplo': ['10.0.0.5'] }) as any,
    );
    expect(r).toEqual({ ok: false, motivo: 'endereço de imagem recusado' });
  });

  it('recusa se QUALQUER um dos endereços for privado', async () => {
    // O ataque: registrar o mesmo nome com um IP público e um privado, e
    // torcer para o código olhar só o primeiro.
    const r = await verificarEndereco(
      'https://misto.exemplo/a.png',
      comDns({ 'misto.exemplo': ['104.21.0.1', '169.254.169.254'] }) as any,
    );
    expect(r.ok).toBe(false);
  });

  it('recusa quando o DNS não resolve', async () => {
    const r = await verificarEndereco(
      'https://nao-existe.exemplo/a.png',
      comDns({}) as any,
    );
    expect(r.ok).toBe(false);
  });

  it('recusa IP literal privado na URL, sem sequer consultar o DNS', async () => {
    // Sem nome de host não há o que resolver; a checagem tem que olhar o
    // literal também, senão a defesa inteira se contorna trocando o nome pelo
    // endereço numérico.
    //
    // ⚠️ O resolvedor aqui MENTE de propósito: se for chamado, devolve um IP
    // público e o endereço passaria. É o que torna a decisão observável — com
    // um mock que rejeita tudo, o teste passa mesmo sem o curto-circuito do
    // literal, e não prova nada.
    const resolvedorQueMente = jest.fn(async () => [{ address: '8.8.8.8' }]);
    const r = await verificarEndereco(
      'http://169.254.169.254/latest/meta-data/',
      resolvedorQueMente as any,
    );
    expect(r.ok).toBe(false);
    expect(resolvedorQueMente).not.toHaveBeenCalled();
  });

  it('recusa URL que não dá para interpretar', async () => {
    const r = await verificarEndereco('não é url', comDns({}) as any);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/endereco-seguro.spec.ts
```

Esperado: FAIL — `Cannot find module './endereco-seguro'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/imagens/endereco-seguro.ts`:

```ts
import { lookup } from 'node:dns/promises';

/**
 * Decide se uma URL de imagem pode ser buscada.
 *
 * Este é o ponto onde o serviço faz **requisição de saída para uma URL que veio
 * do texto de uma questão**. `![](http://169.254.169.254/latest/meta-data/)` é
 * o desenho clássico de SSRF: o endereço de metadata devolve credenciais da
 * instância, sem autenticação, em praticamente toda nuvem.
 *
 * ⚠️ **O que esta defesa NÃO cobre: DNS rebinding.** Entre resolver o nome e
 * abrir a conexão, o registro pode mudar para um IP privado. Fechar exigiria
 * fixar o IP resolvido na conexão, o que precisa de um `Agent` do `undici` —
 * que não é dependência direta deste projeto.
 *
 * A decisão de não fechar é do modelo de ameaça, não de preguiça: o texto da
 * questão é escrito por administrador nosso, não pelo público, então o ataque
 * exige conta de admin comprometida **e** servidor DNS controlado — e quem tem
 * a primeira tem caminhos mais diretos.
 *
 * **Se um dia o cadastro de questão abrir para fora, este parágrafo é o que
 * manda reabrir a decisão.**
 */

type Resolvedor = (host: string) => Promise<{ address: string }[]>;

const resolvedorPadrao: Resolvedor = (host) => lookup(host, { all: true });

const emFaixa = (ip: string, primeiro: number, segundoDe?: [number, number]) => {
  const partes = ip.split('.').map(Number);
  if (partes[0] !== primeiro) return false;
  if (!segundoDe) return true;
  return partes[1] >= segundoDe[0] && partes[1] <= segundoDe[1];
};

/**
 * Faixas que nunca devem ser alcançadas a partir de conteúdo de usuário.
 *
 * O IPv4 embrulhado em IPv6 (`::ffff:10.0.0.1`) é desembrulhado antes de
 * testar: chega ao mesmo lugar por outro caminho.
 */
export function ehPrivado(ip: string): boolean {
  const limpo = ip.toLowerCase().replace(/^::ffff:/, '');

  if (limpo.includes(':')) {
    if (limpo === '::1' || limpo === '::') return true;
    if (/^f[cd]/.test(limpo)) return true; // ULA, fc00::/7
    if (/^fe[89ab]/.test(limpo)) return true; // link-local, fe80::/10
    return false;
  }

  const partes = limpo.split('.').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n))) {
    return true; // não sei o que é: recuso
  }

  return (
    emFaixa(limpo, 10) ||
    emFaixa(limpo, 127) ||
    emFaixa(limpo, 0) ||
    emFaixa(limpo, 255) ||
    emFaixa(limpo, 169, [254, 254]) ||
    emFaixa(limpo, 172, [16, 31]) ||
    emFaixa(limpo, 192, [168, 168]) ||
    emFaixa(limpo, 100, [64, 127])
  );
}

export type Veredito = { ok: true } | { ok: false; motivo: string };

const RECUSA: Veredito = { ok: false, motivo: 'endereço de imagem recusado' };

export async function verificarEndereco(
  url: string,
  resolvedor: Resolvedor = resolvedorPadrao,
): Promise<Veredito> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return RECUSA;
  }

  // URL numérica não passa pelo DNS. Sem esta checagem a defesa inteira se
  // contorna trocando o nome pelo endereço.
  const literal = host.replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(literal) || literal.includes(':')) {
    return ehPrivado(literal) ? RECUSA : { ok: true };
  }

  let enderecos: { address: string }[];
  try {
    enderecos = await resolvedor(host);
  } catch {
    return RECUSA;
  }

  // TODOS, não o primeiro: o ataque é registrar o mesmo nome com um IP
  // público e um privado.
  if (!enderecos.length || enderecos.some((e) => ehPrivado(e.address))) {
    return RECUSA;
  }
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/endereco-seguro.spec.ts
```

Esperado: PASS, 10 testes.

- [ ] **Step 5: Provar que quatro decisões mordem**

Uma de cada vez, restaurando entre elas. Cole as quatro saídas vermelhas.

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| `.some(` → `[0] &&` (olhar só o primeiro endereço) | `recusa se QUALQUER um dos endereços for privado` |
| remover o bloco do IP literal | `recusa IP literal privado na URL` |
| `emFaixa(limpo, 172, [16, 31])` → `emFaixa(limpo, 172)` | `aceita endereço público, inclusive vizinho das faixas` |
| remover o `replace(/^::ffff:/, '')` | `recusa IPv4 embrulhado em IPv6` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/imagens/endereco-seguro.ts src/modules/caderno/imagens/endereco-seguro.spec.ts
npx eslint src/modules/caderno/imagens/endereco-seguro.ts src/modules/caderno/imagens/endereco-seguro.spec.ts
git add src/modules/caderno/imagens/endereco-seguro.ts src/modules/caderno/imagens/endereco-seguro.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): recusar endereco privado antes de buscar imagem

E aqui que o servico faz requisicao de saida a partir de texto de
questao. 169.254.169.254 devolve credenciais da instancia sem
autenticacao em praticamente toda nuvem.

Checa TODOS os enderecos resolvidos, nao o primeiro -- o ataque e
registrar o mesmo nome com um IP publico e um privado. Checa tambem IP
literal, senao a defesa se contorna trocando o nome pelo endereco. E
desembrulha ::ffff:, que chega no mesmo lugar por outro caminho.

DNS rebinding fica ABERTO e documentado no docblock: fechar exige undici
como dependencia direta, e o modelo de ameaca nao fecha.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 4: `buscador-http.ts` — a busca com tetos

**Files:**
- Create: `src/modules/caderno/imagens/buscador-http.spec.ts`
- Create: `src/modules/caderno/imagens/buscador-http.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/imagens/buscador-http.spec.ts`:

```ts
import { buscarImagem } from './buscador-http';

/** Um corpo que entrega os pedaços que você mandar, como o fetch entregaria. */
const corpo = (pedacos: Buffer[]) => ({
  getReader: () => {
    let i = 0;
    return {
      read: async () =>
        i < pedacos.length
          ? { done: false, value: new Uint8Array(pedacos[i++]) }
          : { done: true, value: undefined },
      cancel: async () => undefined,
    };
  },
});

const resposta = (over: any = {}) => ({
  status: 200,
  headers: { get: () => null },
  body: corpo([Buffer.from('ok')]),
  ...over,
});

const sempreLiberado = async () => ({ ok: true }) as const;

describe('buscarImagem', () => {
  it('devolve os bytes concatenados', async () => {
    const fetch = jest.fn().mockResolvedValue(
      resposta({ body: corpo([Buffer.from('ab'), Buffer.from('cd')]) }),
    );
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r).toEqual({ ok: true, buffer: Buffer.from('abcd') });
  });

  it('não busca quando o endereço é recusado', async () => {
    const fetch = jest.fn();
    const r = await buscarImagem('http://169.254.169.254/x.png', {
      fetch: fetch as any,
      verificar: async () => ({ ok: false, motivo: 'endereço de imagem recusado' }),
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, motivo: 'endereço de imagem recusado' });
  });

  it('corta durante a leitura, mesmo com Content-Length mentindo', async () => {
    // O servidor remoto informa o tamanho, e pode mentir ou omitir. Confiar
    // no cabeçalho é como um "limite" deixa passar 200 MB.
    const pedacos = Array.from({ length: 20 }, () => Buffer.alloc(1024 * 1024));
    const fetch = jest.fn().mockResolvedValue(
      resposta({
        headers: { get: () => '10' },
        body: corpo(pedacos),
      }),
    );
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
      tetoBytes: 5 * 1024 * 1024,
    });
    expect(r).toEqual({ ok: false, motivo: 'imagem grande demais' });
  });

  it('404 vira falha, não exceção', async () => {
    const fetch = jest.fn().mockResolvedValue(resposta({ status: 404 }));
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r).toEqual({ ok: false, motivo: 'imagem não pôde ser baixada' });
  });

  it('erro de rede vira falha, não exceção', async () => {
    const fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r.ok).toBe(false);
  });
});

describe('buscarImagem — redirecionamento', () => {
  const redireciona = (para: string) => ({
    status: 302,
    headers: { get: (h: string) => (h === 'location' ? para : null) },
    body: null,
  });

  it('segue o redirecionamento verificando cada salto', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(redireciona('https://cdn.x.com/a.png'))
      .mockResolvedValueOnce(resposta({ body: corpo([Buffer.from('img')]) }));
    const verificar = jest.fn(sempreLiberado);
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar,
    });
    expect(r).toEqual({ ok: true, buffer: Buffer.from('img') });
    expect(verificar).toHaveBeenCalledTimes(2);
    expect(verificar).toHaveBeenLastCalledWith('https://cdn.x.com/a.png');
  });

  it('recusa o salto para endereço privado', async () => {
    // O furo mais comum desta defesa: verificar só a URL original e deixar o
    // fetch seguir o redirect sozinho. A primeira checagem passa e o destino
    // final nunca é olhado.
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(redireciona('http://169.254.169.254/'));
    const verificar = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, motivo: 'endereço de imagem recusado' });
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: verificar as any,
    });
    expect(r).toEqual({ ok: false, motivo: 'endereço de imagem recusado' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('desiste depois de três saltos', async () => {
    const fetch = jest.fn().mockResolvedValue(redireciona('https://x.com/outro.png'));
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r.ok).toBe(false);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('redirecionamento sem Location vira falha', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue({ status: 302, headers: { get: () => null }, body: null });
    const r = await buscarImagem('https://x.com/a.png', {
      fetch: fetch as any,
      verificar: sempreLiberado,
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/buscador-http.spec.ts
```

Esperado: FAIL — `Cannot find module './buscador-http'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/imagens/buscador-http.ts`:

```ts
import { verificarEndereco, Veredito } from './endereco-seguro';

/**
 * Busca uma imagem na internet, com todos os tetos que uma requisição a partir
 * de conteúdo de usuário precisa ter.
 *
 * ⚠️ **Redirecionamento é seguido à mão, de propósito.** O `fetch` segue
 * sozinho por padrão, e aí a verificação de endereço só olha a URL original: um
 * host público que responde `302 → 169.254.169.254` passa pela defesa inteira.
 * É o furo mais comum deste tipo de checagem.
 *
 * ⚠️ **O teto é contado durante a leitura**, não pelo `Content-Length`. O
 * cabeçalho é informado pelo servidor remoto: pode faltar, e pode mentir.
 */

const TETO_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 5_000;
const MAX_SALTOS = 3;

export type ResultadoDaBusca =
  | { ok: true; buffer: Buffer }
  | { ok: false; motivo: string };

interface Opcoes {
  fetch?: typeof globalThis.fetch;
  verificar?: (url: string) => Promise<Veredito>;
  tetoBytes?: number;
  timeoutMs?: number;
}

export async function buscarImagem(
  url: string,
  opcoes: Opcoes = {},
): Promise<ResultadoDaBusca> {
  const {
    fetch: buscar = globalThis.fetch,
    verificar = verificarEndereco,
    tetoBytes = TETO_BYTES,
    timeoutMs = TIMEOUT_MS,
  } = opcoes;

  let alvo = url;

  for (let salto = 0; salto <= MAX_SALTOS; salto += 1) {
    const veredito = await verificar(alvo);
    if (!veredito.ok) return { ok: false, motivo: veredito.motivo };

    let resposta: Response;
    try {
      resposta = await buscar(alvo, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, motivo: 'imagem não pôde ser baixada' };
    }

    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get('location');
      if (!destino) return { ok: false, motivo: 'imagem não pôde ser baixada' };
      alvo = new URL(destino, alvo).toString();
      continue;
    }

    if (resposta.status !== 200 || !resposta.body) {
      return { ok: false, motivo: 'imagem não pôde ser baixada' };
    }

    return lerComTeto(resposta.body, tetoBytes);
  }

  return { ok: false, motivo: 'imagem não pôde ser baixada' };
}

async function lerComTeto(
  corpo: ReadableStream<Uint8Array>,
  tetoBytes: number,
): Promise<ResultadoDaBusca> {
  const leitor = corpo.getReader();
  const pedacos: Buffer[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.length;
      if (total > tetoBytes) {
        await leitor.cancel();
        return { ok: false, motivo: 'imagem grande demais' };
      }
      pedacos.push(Buffer.from(value));
    }
  } catch {
    return { ok: false, motivo: 'imagem não pôde ser baixada' };
  }

  return { ok: true, buffer: Buffer.concat(pedacos) };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/buscador-http.spec.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Provar que três decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| `redirect: 'manual'` → `'follow'` e tirar o bloco de 3xx | `recusa o salto para endereço privado` |
| trocar a contagem durante a leitura por `Content-Length` | `corta durante a leitura, mesmo com Content-Length mentindo` |
| `salto <= MAX_SALTOS` → `salto < 999` | `desiste depois de três saltos` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/imagens/buscador-http.ts src/modules/caderno/imagens/buscador-http.spec.ts
npx eslint src/modules/caderno/imagens/buscador-http.ts src/modules/caderno/imagens/buscador-http.spec.ts
git add src/modules/caderno/imagens/buscador-http.ts src/modules/caderno/imagens/buscador-http.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): buscar imagem externa com tetos e redirect manual

Redirect e seguido a mao de proposito: o fetch segue sozinho e ai a
verificacao so olha a URL original -- um host publico respondendo
302 -> 169.254.169.254 passa pela defesa inteira. E o furo mais comum
deste tipo de checagem.

Teto contado durante a leitura, nao pelo Content-Length, que e informado
pelo servidor remoto e pode faltar ou mentir.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 5: O placeholder e o glob que o leva ao `dist`

**Files:**
- Create: `src/modules/caderno/imagens/imagem-indisponivel.png`
- Modify: `nest-cli.json`
- Create: `src/modules/caderno/imagens/placeholder.spec.ts`
- Create: `src/modules/caderno/imagens/placeholder.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/imagens/placeholder.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { extensaoDosBytes } from './formato';
import { CAMINHO_PLACEHOLDER, lerPlaceholder } from './placeholder';

describe('placeholder de imagem indisponível', () => {
  it('existe no repo e é um PNG de verdade', () => {
    // Se não for PNG válido, a prova sai com um erro de LaTeX no lugar do
    // marcador — trocando um defeito visível por um que trava a compilação.
    const buffer = fs.readFileSync(CAMINHO_PLACEHOLDER);
    expect(buffer.length).toBeGreaterThan(0);
    expect(extensaoDosBytes(buffer)).toBe('png');
  });

  it('lerPlaceholder devolve os bytes', () => {
    expect(extensaoDosBytes(lerPlaceholder())).toBe('png');
  });

  it('tem um glob no nest-cli.json que o leva para o dist', () => {
    // ⚠️ O ms.dockerfile faz `COPY dist ./` e nada mais: arquivo fora do
    // `dist` NÃO EXISTE em produção. Sem este glob, toda falha de imagem vira
    // "File not found" no LaTeX, e só dentro do container.
    //
    // ⚠️ O teste de globs do card 00 NÃO cobre este arquivo: ele filtra por
    // `startsWith('modules/caderno/templates')`, e este mora em
    // `modules/caderno/imagens`. Por isso existe aqui.
    const nestCli = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../../nest-cli.json'), 'utf-8'),
    ) as { compilerOptions: { assets: { include: string }[] } };

    const relativo = path
      .relative(path.join(__dirname, '../../..'), CAMINHO_PLACEHOLDER)
      .replace(/\\/g, '/');

    expect(relativo).toBe('modules/caderno/imagens/imagem-indisponivel.png');
    expect(
      nestCli.compilerOptions.assets.map((a) => a.include),
    ).toContain('modules/caderno/imagens/*.png');
  });
});
```

⚠️ Confira os `..` dos dois `path.join` contra a profundidade real do arquivo antes de aceitar: um `..`
a mais ou a menos faz o teste ler outro arquivo e passar por acidente.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/placeholder.spec.ts
```

Esperado: FAIL — `Cannot find module './placeholder'`.

- [ ] **Step 3: Criar o PNG**

Um PNG pequeno, com texto legível, cinza claro sobre branco. Sem ImageMagick no ambiente, gere com o
que houver — por exemplo:

```bash
python3 - <<'PY'
import zlib, struct
L, A = 480, 120
# fundo branco com uma moldura cinza: o suficiente para o leitor ver que ali
# havia uma imagem que não veio.
linhas = []
for y in range(A):
    px = bytearray([0])  # filtro 0
    for x in range(L):
        borda = x < 3 or x >= L - 3 or y < 3 or y >= A - 3
        v = 150 if borda else 240
        px += bytes([v, v, v])
    linhas.append(bytes(px))
dados = zlib.compress(b''.join(linhas), 9)

def chunk(tipo, corpo):
    return (struct.pack('>I', len(corpo)) + tipo + corpo
            + struct.pack('>I', zlib.crc32(tipo + corpo) & 0xffffffff))

png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', L, A, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', dados)
       + chunk(b'IEND', b''))
open('src/modules/caderno/imagens/imagem-indisponivel.png','wb').write(png)
print(len(png), 'bytes')
PY
```

Confira com `file` que saiu um PNG.

- [ ] **Step 4: Implementar o módulo e o glob**

`src/modules/caderno/imagens/placeholder.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * O que entra no zip quando uma imagem não pôde ser resolvida.
 *
 * ⚠️ **Toda falha precisa produzir um arquivo.** O card 02 já escreveu
 * `\includegraphics{assets/01}` no `.tex`; se este card não gravar nada com
 * aquele nome, o LaTeX para com "File not found" — o pior desfecho desta POC,
 * porque a pessoa não recebe nada que dê para consertar.
 *
 * ⚠️ Lido com `readFileSync`, não importado: `.ts` fora de `src/` desloca o
 * `rootDir` inferido e move o `dist/main.js`, quebrando o PM2. Ver
 * `ms-simulado-build-rootdir`.
 */
export const CAMINHO_PLACEHOLDER = path.join(
  __dirname,
  'imagem-indisponivel.png',
);

export function lerPlaceholder(): Buffer {
  return fs.readFileSync(CAMINHO_PLACEHOLDER);
}
```

Em `nest-cli.json`, acrescente ao array `assets`:

```json
      { "include": "modules/caderno/imagens/*.png" }
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/placeholder.spec.ts
npx jest --detectOpenHandles --forceExit src/modules/caderno/templates.spec.ts
```

Esperado: PASS nos dois — o do card 00 não pode ter sido afetado.

- [ ] **Step 6: Provar que o glob chega ao `dist`**

```bash
yarn build && ls -l dist/modules/caderno/imagens/imagem-indisponivel.png && rm -rf dist
```

Esperado: o arquivo existe. **É o único jeito de provar isto** — o teste lê o `nest-cli.json`, não o
resultado do build.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/modules/caderno/imagens/placeholder.ts src/modules/caderno/imagens/placeholder.spec.ts
npx eslint src/modules/caderno/imagens/placeholder.ts src/modules/caderno/imagens/placeholder.spec.ts
git add src/modules/caderno/imagens/placeholder.ts src/modules/caderno/imagens/placeholder.spec.ts src/modules/caderno/imagens/imagem-indisponivel.png nest-cli.json
git commit -m "$(cat <<'EOF'
feat(caderno): placeholder de imagem indisponivel

Toda falha precisa produzir um ARQUIVO: o card 02 ja escreveu
\includegraphics{assets/01} no .tex, e sem arquivo o LaTeX para com
"File not found" -- o pior desfecho, porque a pessoa nao recebe nada
consertavel.

Glob proprio no nest-cli.json, com teste proprio: o teste de globs do
card 00 filtra por startsWith('modules/caderno/templates') e NAO cobriria
este arquivo -- ficaria verde com o placeholder sumindo do dist.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 6: `cache-r2.ts` — a cópia durável

**Files:**
- Create: `src/modules/caderno/imagens/cache-r2.spec.ts`
- Create: `src/modules/caderno/imagens/cache-r2.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/imagens/cache-r2.spec.ts`:

```ts
import { CacheDeImagens, chaveDoCache } from './cache-r2';

const storageFalso = () => {
  const objetos = new Map<string, Buffer>();
  return {
    objetos,
    get: jest.fn(async (key: string) => {
      const b = objetos.get(key);
      if (!b) throw new Error('NoSuchKey');
      return b;
    }),
    putObject: jest.fn(async (key: string, body: Buffer) => {
      objetos.set(key, body);
    }),
  };
};

describe('chaveDoCache', () => {
  it('é o sha256 da URL, sob o prefixo do caderno', () => {
    // Chave determinística dá idempotência de graça: baixar a mesma URL duas
    // vezes não cria duas cópias, e o acervo inteiro deduplica sem tabela.
    const chave = chaveDoCache('https://enem.dev/a/b.png');
    expect(chave).toMatch(/^caderno-cache\/[0-9a-f]{64}$/);
    expect(chave).toBe(chaveDoCache('https://enem.dev/a/b.png'));
  });

  it('URLs diferentes dão chaves diferentes', () => {
    expect(chaveDoCache('https://x.com/a.png')).not.toBe(
      chaveDoCache('https://x.com/b.png'),
    );
  });

  it('não leva extensão', () => {
    // O formato real sai dos magic bytes na hora de montar o zip; gravar a
    // extensão aqui seria repetir a mentira do nome da URL.
    expect(chaveDoCache('https://x.com/a.png')).not.toContain('.png');
  });
});

describe('CacheDeImagens', () => {
  it('devolve null quando não tem', async () => {
    const storage = storageFalso();
    const cache = new CacheDeImagens(storage as any);
    expect(await cache.ler('https://x.com/a.png')).toBeNull();
  });

  it('grava e depois lê', async () => {
    const storage = storageFalso();
    const cache = new CacheDeImagens(storage as any);
    await cache.gravar('https://x.com/a.png', Buffer.from('bytes'));
    expect(await cache.ler('https://x.com/a.png')).toEqual(Buffer.from('bytes'));
  });

  it('grava sem bucket explícito, no bucket do próprio serviço', async () => {
    // O QUESTAO_BUCKET é credencial de LEITURA APENAS. Escrever o cache lá
    // falharia em produção com um erro de permissão que ninguém liga a isto.
    const storage = storageFalso();
    const cache = new CacheDeImagens(storage as any);
    await cache.gravar('https://x.com/a.png', Buffer.from('b'));
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.stringContaining('caderno-cache/'),
      expect.any(Buffer),
      'application/octet-stream',
    );
  });

  it('falha de leitura no cache não derruba: devolve null', async () => {
    const storage = storageFalso();
    storage.get = jest.fn(async () => {
      throw new Error('rede caiu');
    });
    const cache = new CacheDeImagens(storage as any);
    expect(await cache.ler('https://x.com/a.png')).toBeNull();
  });

  it('falha de escrita no cache não derruba: só não cacheia', async () => {
    // O cache é otimização. Não poder gravar não pode impedir a prova de sair.
    const storage = storageFalso();
    storage.putObject = jest.fn(async () => {
      throw new Error('sem permissão');
    });
    const cache = new CacheDeImagens(storage as any);
    await expect(
      cache.gravar('https://x.com/a.png', Buffer.from('b')),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/cache-r2.spec.ts
```

Esperado: FAIL — `Cannot find module './cache-r2'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/imagens/cache-r2.ts`:

```ts
import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { StorageService } from '../../../shared/storage/storage.service';

/**
 * A cópia durável de uma imagem externa no nosso R2.
 *
 * ⚠️ **Isto é cache, não republicação.** A questão continua apontando para o
 * host externo; o R2 só evita rebaixar a mesma imagem a cada download. Apagar o
 * prefixo `caderno-cache/` inteiro não quebra nada — só esfria o cache.
 *
 * Promover a cópia a asset definitivo e reescrever a referência da questão é o
 * **card 08**, que tem `--dry-run`, ensaio em homologação e a pergunta de
 * direito autoral em aberto. Fazer isso como efeito colateral de um download
 * seria decidir por acidente.
 *
 * ⚠️ **Grava no bucket do próprio serviço, não no `QUESTAO_BUCKET`.** Aquela
 * credencial é de leitura apenas. O bucket usado ainda se chama
 * `CARTAO_BUCKET`, nome que ficou mentiroso — renomear env var custa
 * coordenação de deploy que uma POC não precisa pagar.
 */

const PREFIXO = 'caderno-cache';

/**
 * A chave é o sha256 da URL, e isso dá três coisas de graça: idempotência
 * (baixar duas vezes não cria duas cópias), dedup no acervo inteiro sem tabela
 * nenhuma, e um nome que não carrega byte nenhum vindo do usuário.
 *
 * Sem extensão de propósito: o formato real sai dos magic bytes na hora de
 * montar o zip, e gravar a extensão aqui seria repetir a mentira do nome da
 * URL.
 */
export function chaveDoCache(url: string): string {
  return `${PREFIXO}/${createHash('sha256').update(url).digest('hex')}`;
}

export class CacheDeImagens {
  private readonly logger = new Logger(CacheDeImagens.name);

  constructor(private readonly storage: StorageService) {}

  async ler(url: string): Promise<Buffer | null> {
    try {
      return await this.storage.get(chaveDoCache(url));
    } catch {
      // Ausência e falha são a mesma coisa daqui: em qualquer um dos casos a
      // imagem vai ser buscada na fonte.
      return null;
    }
  }

  async gravar(url: string, buffer: Buffer): Promise<void> {
    try {
      await this.storage.putObject(
        chaveDoCache(url),
        buffer,
        'application/octet-stream',
      );
    } catch (erro) {
      // Cache é otimização: não poder gravar não pode impedir a prova de sair.
      this.logger.warn(
        `não consegui cachear ${url}: ${(erro as Error).message}`,
      );
    }
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/cache-r2.spec.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 5: Provar que a degradação morde**

Tire o `try/catch` do `gravar` e confirme que `falha de escrita no cache não derruba` fica vermelho.
Restaure. Faça o mesmo com o `ler`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/imagens/cache-r2.ts src/modules/caderno/imagens/cache-r2.spec.ts
npx eslint src/modules/caderno/imagens/cache-r2.ts src/modules/caderno/imagens/cache-r2.spec.ts
git add src/modules/caderno/imagens/cache-r2.ts src/modules/caderno/imagens/cache-r2.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): cache de imagem externa no R2

Chave e o sha256 da URL: idempotencia de graca, dedup no acervo inteiro
sem tabela, e nenhum byte de usuario no nome.

E CACHE, nao republicacao -- a questao continua apontando pro host
externo, e apagar o prefixo nao quebra nada. Promover a asset e reescrever
a referencia e o card 08, que tem dry-run e a pergunta de direito autoral
em aberto.

Grava no bucket do proprio servico: QUESTAO_BUCKET e leitura apenas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 7: `resolver.ts` — o serviço que junta tudo

**Files:**
- Create: `src/modules/caderno/imagens/resolver.spec.ts`
- Create: `src/modules/caderno/imagens/resolver.ts`

⚠️ **Armadilha de tipo deste repo, descoberta na Task 4:** o `tsconfig.json` tem
`strictNullChecks: false` (ao lado de `strict: true`, e o `false` explícito vence). Com isso o
TypeScript **não estreita união discriminada por negação** — `if (!resultado.ok)` não funciona, mas
`if (resultado.ok === false)` sim. Pela mesma razão, função aninhada dentro de object literal de teste
pode precisar de anotação explícita de retorno.

⚠️ **Os testes desta task usam `arquivo: 'assets/01'`, sem extensão — e nesta altura o card 02 ainda
emite `'assets/01.png'`.** Não é engano: quem tira a extensão é a Task 8, logo a seguir. O resolver
recebe `arquivo` pronto e só acrescenta a extensão que os bytes disserem, então a unidade não depende
da ordem; a integração das duas só é exercitada no gate (Task 9), que vem depois das duas. Se você
estranhar a divergência ao ler o `imagens.ts` do card 02, é isto.

- [ ] **Step 1: Escrever o teste que falha**

`src/modules/caderno/imagens/resolver.spec.ts`:

```ts
import { ImagemRef } from '../gerador/tipos';
import { ResolverDeImagens } from './resolver';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = Buffer.from('GIF89a-resto');

const montar = (over: any = {}) => {
  const noBucket = new Map<string, Buffer>(over.bucket ?? []);
  const noCache = new Map<string, Buffer>();
  const storage = {
    get: jest.fn(async (key: string, bucket?: string) => {
      const onde = bucket ? noBucket : noCache;
      const b = onde.get(key);
      if (!b) throw new Error('NoSuchKey');
      return b;
    }),
    putObject: jest.fn(async (key: string, body: Buffer) => {
      noCache.set(key, body);
    }),
  };
  const env = { get: () => 'bucket-de-questoes' };
  const buscar = over.buscar ?? jest.fn(async () => ({ ok: true, buffer: PNG }));
  const resolver = new ResolverDeImagens(storage as any, env as any);
  (resolver as any).buscar = buscar;
  return { resolver, storage, buscar, noCache };
};

const url = (u: string, arquivo: string): ImagemRef => ({
  origem: 'url',
  url: u,
  arquivo,
});
const r2 = (key: string, arquivo: string): ImagemRef => ({
  origem: 'r2',
  key,
  arquivo,
});

describe('ResolverDeImagens — origem r2', () => {
  it('lê do QUESTAO_BUCKET, não do bucket do serviço', async () => {
    const { resolver, storage } = montar({
      bucket: [['assets/x.png', PNG]],
    });
    const res = await resolver.resolver([r2('assets/x.png', 'assets/01')]);
    expect(storage.get).toHaveBeenCalledWith('assets/x.png', 'bucket-de-questoes');
    expect(res.arquivos).toEqual([{ nome: 'assets/01.png', buffer: PNG }]);
    expect(res.metricas.doBucket).toBe(1);
  });

  it('key inexistente vira placeholder e aviso, sem exceção', async () => {
    const { resolver } = montar();
    const res = await resolver.resolver([r2('assets/sumiu.png', 'assets/01')]);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
    expect(res.avisos).toEqual([
      'assets/01 — imagem não encontrada no acervo',
    ]);
    expect(res.metricas.falhas).toBe(1);
  });
});

describe('ResolverDeImagens — origem url', () => {
  it('cache frio: busca uma vez e grava', async () => {
    const { resolver, buscar, noCache } = montar();
    const res = await resolver.resolver([url('https://x.com/a.png', 'assets/01')]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(noCache.size).toBe(1);
    expect(res.metricas.daInternet).toBe(1);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
  });

  it('cache quente: não busca', async () => {
    const { resolver, buscar } = montar();
    await resolver.resolver([url('https://x.com/a.png', 'assets/01')]);
    (buscar as jest.Mock).mockClear();

    const res = await resolver.resolver([url('https://x.com/a.png', 'assets/07')]);
    expect(buscar).not.toHaveBeenCalled();
    expect(res.metricas.doCache).toBe(1);
    expect(res.metricas.daInternet).toBe(0);
  });

  it('a mesma URL em duas refs busca uma vez só', async () => {
    const { resolver, buscar } = montar();
    const res = await resolver.resolver([
      url('https://x.com/a.png', 'assets/01'),
      url('https://x.com/a.png', 'assets/02'),
    ]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(res.arquivos.map((a) => a.nome)).toEqual([
      'assets/01.png',
      'assets/02.png',
    ]);
  });

  it('busca recusada vira placeholder com o motivo', async () => {
    const { resolver } = montar({
      buscar: jest.fn(async () => ({
        ok: false,
        motivo: 'endereço de imagem recusado',
      })),
    });
    const res = await resolver.resolver([
      url('http://169.254.169.254/x.png', 'assets/01'),
    ]);
    expect(res.avisos).toEqual([
      'assets/01 — endereço de imagem recusado',
    ]);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
  });
});

describe('ResolverDeImagens — formato', () => {
  it('nomeia pelos magic bytes, não pela URL', async () => {
    // A URL diz .png e os bytes são JPEG. Quem manda são os bytes: o graphicx
    // escolhe o driver pela extensão do arquivo no zip.
    const { resolver } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: JPEG })),
    });
    const res = await resolver.resolver([url('https://x.com/a.png', 'assets/01')]);
    expect(res.arquivos[0].nome).toBe('assets/01.jpeg');
  });

  it('GIF vira placeholder, porque o pdflatex não inclui', async () => {
    const { resolver } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: GIF })),
    });
    const res = await resolver.resolver([url('https://x.com/a.gif', 'assets/01')]);
    expect(res.arquivos[0].nome).toBe('assets/01.png');
    expect(res.avisos).toEqual([
      'assets/01 — formato de imagem não suportado',
    ]);
  });

  it('não cacheia o que não vai usar', async () => {
    const { resolver, noCache } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: GIF })),
    });
    await resolver.resolver([url('https://x.com/a.gif', 'assets/01')]);
    expect(noCache.size).toBe(0);
  });
});

describe('ResolverDeImagens — tetos e bordas', () => {
  it('lista vazia devolve resultado vazio, sem chamar nada', async () => {
    const { resolver, storage, buscar } = montar();
    const res = await resolver.resolver([]);
    expect(res.arquivos).toEqual([]);
    expect(res.avisos).toEqual([]);
    expect(storage.get).not.toHaveBeenCalled();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('estourado o teto agregado, o resto vira placeholder', async () => {
    const grande = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const { resolver } = montar({
      buscar: jest.fn(async () => ({ ok: true, buffer: grande })),
    });
    const refs = Array.from({ length: 20 }, (_, i) =>
      url(`https://x.com/${i}.png`, `assets/${i}`),
    );
    const res = await resolver.resolver(refs);
    expect(res.arquivos).toHaveLength(20);
    expect(
      res.avisos.some((a) => a.includes('limite de imagens')),
    ).toBe(true);
    expect(res.metricas.bytes).toBeLessThanOrEqual(40 * 1024 * 1024);
  });

  it('sem QUESTAO_BUCKET, falha com mensagem explícita', async () => {
    const { resolver } = montar();
    (resolver as any).env = { get: () => undefined };
    await expect(
      resolver.resolver([r2('assets/x.png', 'assets/01')]),
    ).rejects.toThrow(/QUESTAO_BUCKET/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/resolver.spec.ts
```

Esperado: FAIL — `Cannot find module './resolver'`.

- [ ] **Step 3: Implementar**

`src/modules/caderno/imagens/resolver.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../../shared/modules/env/env.service';
import { StorageService } from '../../../shared/storage/storage.service';
import { ImagemRef } from '../gerador/tipos';
import { buscarImagem } from './buscador-http';
import { CacheDeImagens } from './cache-r2';
import { extensaoDosBytes } from './formato';
import { lerPlaceholder } from './placeholder';
import { ArquivoDoZip, ResultadoDaResolucao } from './tipos';

/**
 * Busca os bytes de cada imagem do caderno e devolve os arquivos do zip.
 *
 * ⚠️ **Nada lança, exceto configuração ausente.** Uma imagem que não veio é um
 * defeito visível numa questão; uma exceção aqui é a prova inteira não saindo.
 * Toda falha grava o placeholder sob o nome que o card 02 já escreveu no
 * `.tex`, porque sem arquivo o LaTeX para com "File not found".
 */

const TETO_AGREGADO = 40 * 1024 * 1024;
const CONCORRENCIA = 5;

@Injectable()
export class ResolverDeImagens {
  private readonly logger = new Logger(ResolverDeImagens.name);
  private readonly cache: CacheDeImagens;
  /** Injetável para teste; em produção é sempre o buscador real. */
  private readonly buscar = buscarImagem;

  constructor(
    private readonly storage: StorageService,
    private readonly env: EnvService,
  ) {
    this.cache = new CacheDeImagens(storage);
  }

  async resolver(refs: ImagemRef[]): Promise<ResultadoDaResolucao> {
    const inicio = Date.now();
    const arquivos: ArquivoDoZip[] = [];
    const avisos: string[] = [];
    const metricas = {
      doCache: 0,
      doBucket: 0,
      daInternet: 0,
      falhas: 0,
      bytes: 0,
      ms: 0,
    };

    // Uma busca por origem, não por referência: a mesma imagem costuma
    // aparecer em várias questões, e o card 02 não deduplica quando os nomes
    // no zip diferem.
    const jaBuscado = new Map<string, Buffer | null>();

    const umaPorVez = async (ref: ImagemRef): Promise<void> => {
      const identidade = ref.origem === 'r2' ? `r2:${ref.key}` : `url:${ref.url}`;

      let bytes: Buffer | null;
      if (jaBuscado.has(identidade)) {
        bytes = jaBuscado.get(identidade)!;
      } else {
        bytes = await this.obter(ref, metricas, avisos);
        jaBuscado.set(identidade, bytes);
      }

      if (!bytes) {
        arquivos.push({ nome: `${ref.arquivo}.png`, buffer: lerPlaceholder() });
        return;
      }

      const extensao = extensaoDosBytes(bytes);
      if (!extensao) {
        avisos.push(`${ref.arquivo} — formato de imagem não suportado`);
        metricas.falhas += 1;
        jaBuscado.set(identidade, null);
        arquivos.push({ nome: `${ref.arquivo}.png`, buffer: lerPlaceholder() });
        return;
      }

      if (metricas.bytes + bytes.length > TETO_AGREGADO) {
        avisos.push(`${ref.arquivo} — caderno passou do limite de imagens`);
        metricas.falhas += 1;
        arquivos.push({ nome: `${ref.arquivo}.png`, buffer: lerPlaceholder() });
        return;
      }

      metricas.bytes += bytes.length;
      arquivos.push({ nome: `${ref.arquivo}.${extensao}`, buffer: bytes });
    };

    for (let i = 0; i < refs.length; i += CONCORRENCIA) {
      await Promise.all(refs.slice(i, i + CONCORRENCIA).map(umaPorVez));
    }

    metricas.ms = Date.now() - inicio;
    return { arquivos, avisos, metricas };
  }

  /** Os bytes, ou `null` se não deu — o motivo já vai para `avisos`. */
  private async obter(
    ref: ImagemRef,
    metricas: ResultadoDaResolucao['metricas'],
    avisos: string[],
  ): Promise<Buffer | null> {
    if (ref.origem === 'r2') {
      const bucket = this.env.get('QUESTAO_BUCKET');
      if (!bucket) {
        // Configuração ausente é a única coisa que lança: seguir sem ela
        // transformaria toda imagem em "não encontrada", que é o sintoma mais
        // confuso possível.
        throw new Error(
          'QUESTAO_BUCKET não configurado: não dá para ler imagens de questão',
        );
      }
      try {
        const bytes = await this.storage.get(ref.key, bucket);
        metricas.doBucket += 1;
        return bytes;
      } catch {
        avisos.push(`${ref.arquivo} — imagem não encontrada no acervo`);
        metricas.falhas += 1;
        return null;
      }
    }

    const doCache = await this.cache.ler(ref.url);
    if (doCache) {
      metricas.doCache += 1;
      return doCache;
    }

    const resultado = await this.buscar(ref.url);
    // ⚠️ `=== false`, não `!resultado.ok`: este repo tem
    // `strictNullChecks: false` no tsconfig (apesar de `strict: true`), e sem
    // ele o TypeScript não estreita união discriminada por negação.
    if (resultado.ok === false) {
      avisos.push(`${ref.arquivo} — ${resultado.motivo}`);
      metricas.falhas += 1;
      return null;
    }

    metricas.daInternet += 1;

    // Só cacheia o que o pdflatex vai conseguir usar: guardar um GIF só
    // ocuparia espaço para falhar mais rápido da próxima vez.
    if (extensaoDosBytes(resultado.buffer)) {
      await this.cache.gravar(ref.url, resultado.buffer);
    }

    return resultado.buffer;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/imagens/resolver.spec.ts
```

Esperado: PASS, 12 testes.

⚠️ Se o teste do teto agregado ficar instável por causa do lote de concorrência, **reporte** em vez de
afrouxar a asserção. A ordem dentro de um lote de 5 não é determinística, e isso pode ser um defeito
real do desenho, não do teste.

- [ ] **Step 5: Provar que quatro decisões mordem**

| Mutação | Teste que precisa ficar vermelho |
|---|---|
| tirar o `jaBuscado` | `a mesma URL em duas refs busca uma vez só` |
| não passar `bucket` no `storage.get` da origem r2 | `lê do QUESTAO_BUCKET, não do bucket do serviço` |
| cachear mesmo sem extensão reconhecida | `não cacheia o que não vai usar` |
| devolver `[]` em vez de placeholder na falha | `key inexistente vira placeholder e aviso` |

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/imagens/resolver.ts src/modules/caderno/imagens/resolver.spec.ts
npx eslint src/modules/caderno/imagens/resolver.ts src/modules/caderno/imagens/resolver.spec.ts
git add src/modules/caderno/imagens/resolver.ts src/modules/caderno/imagens/resolver.spec.ts
git commit -m "$(cat <<'EOF'
feat(caderno): resolver de imagens do caderno

Cache -> bucket/internet -> grava no cache. Concorrencia 5, dedup por
origem (a mesma imagem aparece em varias questoes e o card 02 nao
deduplica quando os nomes no zip diferem).

Nada lanca, exceto QUESTAO_BUCKET ausente: seguir sem ela transformaria
toda imagem em "nao encontrada", o sintoma mais confuso possivel. Toda
falha grava o placeholder sob o nome que o card 02 ja escreveu no .tex.

O nome do arquivo sai dos magic bytes, nao da URL.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 8: O card 02 para de emitir a extensão

**Files:**
- Modify: `src/modules/caderno/gerador/imagens.ts`
- Modify: `src/modules/caderno/gerador/imagens.spec.ts`
- Modify: `src/modules/caderno/gerador/__snapshots__/gerar-caderno.snapshot.spec.ts.snap`

O card 02 crava a extensão no `.tex` e **recusa** referência sem extensão. Isso torna impossível
"extensão pelos magic bytes", e os bytes é que sabem a verdade. O card 02 cede.

⚠️ **Isto apaga uma regra de segurança, e o motivo importa:** a `EXTENSAO_VALIDA` existia porque a
extensão era o único byte da referência que chegava ao `.tex`. Sem extensão, o caminho emitido é 100%
gerado por nós — a injeção pelo nome de arquivo deixa de ser **possível**, em vez de ser barrada.

⚠️ **A lista fechada de esquemas FICA.** Ela nunca foi sobre LaTeX: é ela que decide o que a Task 4 vai
buscar na rede.

- [ ] **Step 1: Ajustar os testes primeiro**

Em `src/modules/caderno/gerador/imagens.spec.ts`:

- os `expect(...).toEqual({ arquivo: 'assets/01.png' })` viram `{ arquivo: 'assets/01' }`
- o mesmo em `imagens[0]`, e em todos os `assets/NN.<ext>` do arquivo
- **remova** os dois testes de recusa por extensão (`recusa extensão que quebraria o grupo` e
  `recusa quando não há extensão nenhuma`) e ponha no lugar:

```ts
  it('aceita referência sem extensão, porque quem decide são os bytes', () => {
    // A extensão do nome mente: um `.png` que serve JPEG faz o graphicx
    // escolher o driver errado. O card 03 nomeia o arquivo pelos magic bytes,
    // e por isso o `.tex` não carrega extensão nenhuma.
    const c = new ColetorDeImagens();
    expect(c.registrar('https://x.com/sem-extensao')).toEqual({
      arquivo: 'assets/01',
    });
  });

  it('a extensão do nome não vaza para o .tex', () => {
    // Era a única superfície de injeção que restava: `mapa.p}ng` fecharia o
    // grupo do \includegraphics cedo. Sem extensão no caminho emitido, deixa
    // de ser possível em vez de ser barrada.
    const c = new ColetorDeImagens();
    const r = c.registrar('asset://assets/mapa.p}ng');
    expect(r).toEqual({ arquivo: 'assets/01' });
    expect(JSON.stringify(c.imagens)).not.toContain('}ng"');
    expect((r as { arquivo: string }).arquivo).not.toContain('}');
  });
```

⚠️ Mantenha intacto todo o `describe` dos esquemas (`ftp:`, `javascript:`, `file:`).

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno/gerador/imagens.spec.ts
```

Esperado: FAIL — o coletor ainda põe extensão e ainda recusa referência sem ela.

- [ ] **Step 3: Implementar**

Em `imagens.ts`:

- apague a constante `EXTENSAO_VALIDA` e a função `extensaoDe`
- em `registrar`, remova o bloco `const ext = extensaoDe(...); if (!ext) return …`
- o nome passa a ser `` `assets/${String(this.refs.length + 1).padStart(2, '0')}` ``
- atualize o docblock do módulo: a extensão sai dos magic bytes no card 03, e por isso o caminho
  emitido não tem byte nenhum vindo do usuário

- [ ] **Step 4: Regenerar o snapshot e LÊ-LO**

```bash
npx jest --detectOpenHandles --forceExit -u src/modules/caderno/gerador/
```

Abra `src/modules/caderno/gerador/__snapshots__/gerar-caderno.snapshot.spec.ts.snap` e confira:

- [ ] `\includegraphics[max width=\linewidth]{assets/01}` — sem `.png`
- [ ] `\includegraphics[width=240pt,max width=\linewidth]{assets/02}` — sem `.jpeg`
- [ ] nenhum `\includegraphics` no arquivo contém ponto no caminho
- [ ] o snapshot das `imagens` mostra `arquivo: 'assets/01'` e `'assets/02'`
- [ ] o resto do `.tex` não mudou

- [ ] **Step 5: Suíte inteira do caderno**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno
```

Esperado: tudo verde.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/modules/caderno/gerador/imagens.ts src/modules/caderno/gerador/imagens.spec.ts
npx eslint src/modules/caderno/gerador/imagens.ts src/modules/caderno/gerador/imagens.spec.ts
git add src/modules/caderno/gerador/imagens.ts src/modules/caderno/gerador/imagens.spec.ts src/modules/caderno/gerador/__snapshots__/
git commit -m "$(cat <<'EOF'
refactor(caderno): tirar a extensao do caminho emitido no .tex

O card 02 cravava a extensao tirada do path da URL, e recusava referencia
sem extensao. Isso tornava impossivel o "extensao pelos magic bytes" do
card 03 -- e sao os bytes que sabem a verdade: um .png servindo JPEG faz
o graphicx escolher o driver errado.

Agora o .tex diz {assets/01} e o LaTeX acha o arquivo sozinho.

Isso APAGA a regra EXTENSAO_VALIDA, e o motivo importa: ela existia porque
a extensao era o unico byte da referencia que chegava ao .tex. Sem
extensao, o caminho e 100% gerado por nos -- a injecao pelo nome deixa de
ser possivel, em vez de ser barrada.

A lista fechada de esquemas FICA: ela nunca foi sobre LaTeX, e sim sobre
o que o card 03 vai buscar na rede.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PrN5kdVC3BqJMYTGnEL9K7
EOF
)"
```

---

### Task 9: Gate no Overleaf — **PARA e espera o usuário**

Diferente do card 02, este gate usa **imagem de verdade**: o do card 02 encheu o `assets/` com cópias
do `logo.png`.

- [ ] **Step 1: Montar o pacote com resolução real**

Script descartável no scratchpad (não no repo), que:

1. monta um `SimuladoParaCaderno` com **URLs reais do `enem.dev`** — pegue duas ou três do acervo, ou
   use as do `simulado-exemplo.ts`
2. chama `gerarCaderno`
3. chama `ResolverDeImagens.resolver(caderno.imagens)` com um `StorageService` de verdade
4. escreve os `arquivos` e os dois `.tex` junto com `ARQUIVOS_DO_ZIP`
5. **imprime as métricas**

Precisa de `.env` com `AWS_*`, `CARTAO_BUCKET` e `QUESTAO_BUCKET`. Se não houver credencial à mão,
**pare e peça** — não invente mock aqui: o ponto do gate é justamente o caminho real.

- [ ] **Step 2: Rodar duas vezes**

A primeira mostra `daInternet` alto. **A segunda tem que mostrar `doCache` alto e `daInternet` zero.**
É o critério de aceitação do cache, e não existe teste unitário que o prove de verdade.

- [ ] **Step 3: Empacotar e apagar o script**

Zip com raiz plana e `assets/` como única subpasta. `git status --porcelain` limpo.

- [ ] **Step 4: PARE**

Diga ao usuário onde está o zip e o que olhar:

- **a figura certa em cada questão** — é a primeira vez que imagem real do acervo entra no caderno
- `assets/01` **sem extensão** resolvendo: é a única parte deste desenho que nenhum teste alcança, e o
  plano B, se falhar, está na spec
- figura dentro da coluna, sem estourar
- o `% AVISO:` no topo do `conteudo.tex` batendo com os avisos das métricas
- as métricas das duas rodadas

**Não prossiga sem a resposta.**

---

### Task 10: Fechar

- [ ] **Step 1: Cobertura**

```bash
npx jest --detectOpenHandles --forceExit --coverage --collectCoverageFrom='modules/caderno/imagens/**/*.ts' src/modules/caderno
```

Esperado: ≥ 90% em statements. Abaixo, acrescente teste — nunca `istanbul ignore`.

- [ ] **Step 2: Suíte e build**

```bash
npx jest --detectOpenHandles --forceExit src/modules/caderno src/modules/cartao-resposta src/shared
yarn build && ls dist/main.js dist/modules/caderno/imagens/imagem-indisponivel.png && rm -rf dist
```

- [ ] **Step 3: Nenhuma chamada de rede real na suíte**

```bash
grep -rn "globalThis.fetch\|require('node:dns')\|from 'node:dns'" src/modules/caderno/imagens/*.spec.ts
```

Esperado: **nada**. Todo teste injeta `fetch` e resolvedor.

- [ ] **Step 4: Abrir o PR contra a POC**

```bash
git push -u origin feature/caderno-03-imagens
gh pr create --base poc/caderno-overleaf --title "[Caderno · Overleaf] Card 03 — imagens: resolução, defesa e cache"
```

O corpo precisa cobrir: os dois caminhos; a defesa e **o buraco de DNS rebinding que fica aberto e
por quê**; magic bytes e GIF/WEBP; toda falha virando arquivo; o cache ser cache e não republicação; a
mudança no card 02 e por que ela apaga a `EXTENSAO_VALIDA` sem afrouxar nada; e o Redis adiado com a
medição que decide.

⚠️ `--base poc/caderno-overleaf`, **não** `develop`.
