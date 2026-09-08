/**
 * O nome com que o zip chega na máquina de quem baixou.
 *
 * ⚠️ Este valor vai para o header `Content-Disposition`. Aspas ou quebra de
 * linha ali permitiriam injetar outro header, então o resultado é restrito a
 * `[a-z0-9-]` por construção, e não por escape.
 */

/**
 * ⚠️ **O fallback para o `simuladoId` não é preciosismo.** Nome de simulado
 * aceita acento, barra, dois-pontos e emoji, e um nome só de símbolos sanearia
 * para string vazia — o usuário receberia um arquivo chamado `-20260908.zip`.
 */
export function slugDoSimulado(nome: string, simuladoId: string): string {
  const slug = (nome ?? '')
    // NFKD, não NFD: `º` e `ª` são caracteres de COMPATIBILIDADE, não letra
    // com diacrítico, e o NFD não os decompõe. Vale para `½`, `ﬁ` e largura
    // completa também — tratar caso a caso deixaria os outros virando hífen
    // em silêncio.
    .normalize('NFKD')
    // Remove os diacríticos que a decomposição separou das letras.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || simuladoId;
}

/**
 * O timestamp **não versiona nada no servidor**: não guardamos zip nenhum,
 * cada requisição regenera. Ele existe para dois downloads não virarem
 * `caderno.zip` e `caderno (1).zip`, que não dizem qual é o mais novo.
 */
export function nomeDoArquivo(
  nome: string,
  simuladoId: string,
  agora: Date = new Date(),
): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const carimbo =
    `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}` +
    `-${p(agora.getHours())}${p(agora.getMinutes())}`;

  return `${slugDoSimulado(nome, simuladoId)}-${carimbo}.zip`;
}
