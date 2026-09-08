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

const emFaixa = (
  ip: string,
  primeiro: number,
  segundoDe?: [number, number],
) => {
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
