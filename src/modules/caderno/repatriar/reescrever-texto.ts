import { createHash } from 'node:crypto';
import { acharImagens } from '../gerador/texto-para-latex';

/**
 * A parte pura da repatriação: achar as URLs e trocá-las por `asset://`.
 *
 * ⚠️ Usa o `acharImagens` do gerador de propósito. Se a migração e o gerador
 * discordarem do que é um construto de imagem, a migração deixa para trás
 * exatamente as URLs que o gerador continua encontrando.
 */

/** As URLs `http(s)` que estão DENTRO de um construto de imagem. */
export function acharUrlsExternas(texto: string): string[] {
  return acharImagens(texto ?? '')
    .map((o) => o.referencia)
    .filter((r) => /^https?:\/\//i.test(r));
}

/**
 * A chave no R2, derivada da URL.
 *
 * ⚠️ **Determinística, e não um uuid como o `uploadAsset` da api.** É o que
 * sustenta a ordem de escrita: se a gravação da questão falhar depois de a
 * imagem já ter subido, a re-execução encontra o objeto pelo HEAD, pula o
 * download e só atualiza o Mongo. Com uuid, a imagem ficaria órfã e a
 * re-execução criaria uma segunda cópia.
 */
export function chaveDaUrl(url: string, extensao: string): string {
  return `assets/${createHash('sha256').update(url).digest('hex')}.${extensao}`;
}

/**
 * Troca uma URL por `asset://<chave>`, **só dentro de construto de imagem**.
 *
 * ⚠️ Não é `split`/`replaceAll` na URL crua, por dois motivos medidos no
 * acervo:
 *
 * 1. Quase toda questão do ENEM tem uma linha "Disponível em: <url>. Acesso
 *    em …" citando a fonte. Trocá-la corromperia a citação.
 * 2. Substituição por prefixo pegaria `…/a.png.bak` ao trocar `…/a.png`.
 *
 * A troca é por posição, usando as ocorrências que o gerador reconhece — e de
 * trás para a frente, para os índices das anteriores continuarem válidos.
 *
 * ⚠️ De trás para a frente. Com chave real (83 caracteres contra ~40 da URL),
 * processar na ordem crescente desloca os índices seguintes e corrompe a
 * segunda ocorrência em diante.
 */
export function trocarUrl(texto: string, url: string, chave: string): string {
  const alvos = acharImagens(texto)
    .filter((o) => o.referencia === url)
    .sort((a, b) => b.inicio - a.inicio);

  let saida = texto;
  for (const alvo of alvos) {
    const trecho = saida.slice(alvo.inicio, alvo.fim);
    saida =
      saida.slice(0, alvo.inicio) +
      trecho.replace(url, `asset://${chave}`) +
      saida.slice(alvo.fim);
  }
  return saida;
}
