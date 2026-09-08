import { ImagemRef } from './tipos';

/**
 * As imagens de um caderno: reconhecimento, validação, numeração e dedup.
 *
 * O gerador é puro e **não baixa nada**. Este módulo só decide se uma
 * referência é aceitável, dá a ela um nome de arquivo dentro do zip, e guarda
 * de onde ela vem para o card 03 materializar.
 */

/** Esquemas aceitos. Fechado de propósito — ver `registrar`. */
const ESQUEMAS = ['http:', 'https:', 'asset:'];

/**
 * A extensão é o **único byte da referência que chega ao `.tex`**: tudo é
 * renomeado para `assets/NN.<ext>`, e `assets/` e `NN` são gerados por nós.
 *
 * ⚠️ E ela não é sanitizada rio acima: `s3-service.ts:43` monta com
 * `originalname.split('.').pop()?.toLowerCase()`, sem filtro. Um arquivo
 * chamado `mapa.p}ng` produz key terminada em `}`, que fecha o grupo do
 * `\includegraphics` cedo e derrama o resto do documento como LaTeX solto.
 */
const EXTENSAO_VALIDA = /^[A-Za-z0-9]{1,5}$/;

/** Por que uma referência foi recusada. Vira aviso e marcador visível. */
export interface ImagemRecusada {
  motivo: string;
}

/** Onde a imagem aceita mora dentro do zip. */
export interface ImagemAceita {
  arquivo: string;
}

/**
 * Extrai a extensão de uma referência, descartando query e fragmento.
 *
 * Feito na mão em vez de `new URL()` porque `asset://assets/x.png` não tem
 * host e o parser trata o caminho de forma inconsistente entre runtimes.
 */
function extensaoDe(referencia: string): string | null {
  const semQuery = referencia.split(/[?#]/)[0];
  const ultimoSegmento = semQuery.split('/').pop() ?? '';
  const ponto = ultimoSegmento.lastIndexOf('.');
  if (ponto === -1) return null;
  const ext = ultimoSegmento.slice(ponto + 1);
  return EXTENSAO_VALIDA.test(ext) ? ext : null;
}

export class ColetorDeImagens {
  private readonly refs: ImagemRef[] = [];
  private readonly porIdentidade = new Map<string, ImagemAceita>();

  /** As imagens aceitas, na ordem de aparição, já deduplicadas. */
  get imagens(): readonly ImagemRef[] {
    return this.refs;
  }

  /**
   * Registra uma referência e devolve onde ela mora no zip, ou o motivo da
   * recusa.
   *
   * ⚠️ A lista de esquemas é fechada porque o card 03 vai fazer **requisição
   * de saída** para esta URL, vinda do texto de uma questão.
   * `![](http://169.254.169.254/latest/meta-data/)` é o desenho clássico de
   * SSRF. O gerador é quem decide o que entra em `imagens[]`, então é aqui que
   * a classe se fecha — o card 03 herda a lista já filtrada.
   */
  registrar(referencia: string): ImagemAceita | ImagemRecusada {
    const esquema = ESQUEMAS.find((e) => referencia.startsWith(e));
    if (!esquema) return { motivo: 'esquema não aceito' };

    const ext = extensaoDe(referencia);
    if (!ext) return { motivo: 'extensão inválida' };

    // A identidade inclui o esquema: uma URL e uma key podem terminar igual
    // sem serem a mesma imagem.
    const identidade = referencia.split(/[?#]/)[0];
    const jaVisto = this.porIdentidade.get(identidade);
    if (jaVisto) return jaVisto;

    const arquivo = `assets/${String(this.refs.length + 1).padStart(2, '0')}.${ext}`;
    const aceita: ImagemAceita = { arquivo };

    this.refs.push(
      esquema === 'asset:'
        ? { origem: 'r2', key: referencia.slice('asset://'.length), arquivo }
        : { origem: 'url', url: referencia, arquivo },
    );
    this.porIdentidade.set(identidade, aceita);
    return aceita;
  }
}

/**
 * O `\includegraphics`, **sempre como parágrafo próprio**.
 *
 * ⚠️ No acervo a imagem vem colada no texto (`![](…png)Os moradores de
 * Andalsnes…`). Deixada inline, o LaTeX mete a figura dentro da linha e a
 * linha fica da altura dela numa coluna de 8 cm. Figura de prova é bloco.
 *
 * `max width` é do `adjustbox` (carregado `[export]` no preambulo.tex): ele
 * encolhe, nunca amplia. Vem **depois** do `width` para que uma conversão
 * errada de px encolha, em vez de estourar a coluna.
 */
export function emitirImagem(arquivo: string, larguraPx?: number): string {
  // CSS define 1px = 1/96 in; 1pt = 1/72 in. Daí 0,75.
  const opcoes = larguraPx
    ? `width=${Math.round(larguraPx * 0.75)}pt,max width=\\linewidth`
    : 'max width=\\linewidth';
  return `\n\n\\includegraphics[${opcoes}]{${arquivo}}\n\n`;
}

/** O que sai no lugar de uma imagem recusada: visível, nunca silêncio. */
export function emitirMarcador(): string {
  return '\n\n\\textbf{[imagem indisponível]}\n\n';
}
