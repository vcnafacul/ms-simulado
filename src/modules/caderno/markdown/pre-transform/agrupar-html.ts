/** Tipo do nó sintético que o compiler traduz para `center`/`flushright`. */
export const NO_ALINHADO = 'cadernoAlinhado';

/**
 * O `remark-parse` não parseia HTML. Um bloco assim, que é o que o editor
 * grava para texto alinhado:
 *
 *     <div style="text-align: center">
 *
 *     conteúdo
 *
 *     </div>
 *
 * vira TRÊS nós IRMÃOS — `html`, `paragraph`, `html` — sem aninhamento
 * nenhum. Todo projeto tropeça nisso: se ninguém casar a abertura com o
 * fechamento, o alinhamento some e o conteúdo sai solto.
 *
 * Este passe casa os pares e envolve os irmãos num nó sintético.
 *
 * O caso de UMA linha só — `<div style="..."><img ...></div>`, que é como o
 * editor grava imagem alinhada — não passa por aqui: vira um único nó `html`
 * e quem trata é o handler de `html`, com parse da tag.
 *
 * Faz a própria recursão em vez de usar o `visitar`, porque altera o array de
 * filhos durante a caminhada.
 */
const ABERTURA =
  /^<div\s+style\s*=\s*["']?\s*text-align:\s*(left|center|right|justify)\s*;?\s*["']?\s*>$/i;

const FECHAMENTO = /^<\/div>$/i;

export function agruparHtml(no: any): void {
  const filhos = no?.children;
  if (!Array.isArray(filhos)) return;

  for (let i = 0; i < filhos.length; i++) {
    const abre =
      filhos[i]?.type === 'html'
        ? ABERTURA.exec(String(filhos[i].value).trim())
        : null;

    if (!abre) {
      agruparHtml(filhos[i]);
      continue;
    }

    const fecha = filhos.findIndex(
      (n: any, j: number) =>
        j > i && n?.type === 'html' && FECHAMENTO.test(String(n.value).trim()),
    );

    // Sem par: deixa como está e segue. O handler de `html` avisa.
    if (fecha === -1) continue;

    const dentro = filhos.slice(i + 1, fecha);
    dentro.forEach(agruparHtml);

    filhos.splice(i, fecha - i + 1, {
      type: NO_ALINHADO,
      align: abre[1].toLowerCase(),
      children: dentro,
    });
  }
}
