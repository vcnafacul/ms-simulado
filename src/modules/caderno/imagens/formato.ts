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

/**
 * A checagem de tamanho é **redundante para a correção**, e está aqui para o
 * leitor: `buffer[i]` fora do fim devolve `undefined`, e `undefined === <byte>`
 * já é `false`, então o `every` sozinho recusa buffer curto. Sem esta linha o
 * resultado seria o mesmo — nenhum teste consegue matá-la, e isso foi medido,
 * não suposto.
 */
const comeca = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);

/** A extensão do formato, ou `null` se não for algo que o pdflatex inclua. */
export function extensaoDosBytes(buffer: Buffer): string | null {
  if (comeca(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (comeca(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (comeca(buffer, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  return null;
}
