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
    if (veredito.ok === false) return { ok: false, motivo: veredito.motivo };

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
