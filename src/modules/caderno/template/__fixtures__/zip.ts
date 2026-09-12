import JSZip from 'jszip';

/** Monta um zip em memória, como o que o Overleaf entrega. */
export async function zipCom(
  entradas: Record<string, string | Buffer>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [nome, conteudo] of Object.entries(entradas)) {
    zip.file(nome, conteudo);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}
