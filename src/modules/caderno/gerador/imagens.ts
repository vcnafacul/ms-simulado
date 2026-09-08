import { ImagemRef } from './tipos';

/**
 * As imagens de um caderno: reconhecimento, numeração e dedup.
 *
 * O gerador é puro e **não baixa nada**. Este módulo só decide se uma
 * referência é aceitável, dá a ela um nome de arquivo dentro do zip, e guarda
 * de onde ela vem para o card 03 materializar.
 *
 * O caminho emitido (`assets/NN`, sem extensão) não carrega **nenhum** byte
 * vindo do usuário: `assets/` e `NN` são gerados por nós. A extensão sai da
 * jogada de propósito — o card 03 é quem abre os bytes e nomeia o arquivo
 * pelos magic bytes, porque é a extensão do nome que mente (um `.png` que
 * serve JPEG faz o `graphicx` escolher o driver errado). O LaTeX acha
 * `assets/01` sozinho, sem sufixo.
 */

/** Esquemas aceitos. Fechado de propósito — ver `registrar`. */
const ESQUEMAS = ['http:', 'https:', 'asset:'];

/** Por que uma referência foi recusada. Vira aviso e marcador visível. */
export interface ImagemRecusada {
  motivo: string;
}

/** Onde a imagem aceita mora dentro do zip. */
export interface ImagemAceita {
  arquivo: string;
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

    // A identidade inclui o esquema: uma URL e uma key podem terminar igual
    // sem serem a mesma imagem.
    const identidade = referencia.split(/[?#]/)[0];
    const jaVisto = this.porIdentidade.get(identidade);
    if (jaVisto) return jaVisto;

    const arquivo = `assets/${String(this.refs.length + 1).padStart(2, '0')}`;
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
