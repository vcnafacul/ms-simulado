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
