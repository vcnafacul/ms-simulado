/** O que é preciso para desfazer uma escrita. */
export interface LinhaDeReversao {
  questaoId: string;
  campo: string;
  /** O texto INTEIRO do campo, antes. Não um diff: um diff pode não aplicar. */
  original: string;
}

/**
 * ⚠️ A falha é por URL, **não por campo**: a mesma URL pode estar em vários
 * campos da mesma questão, e dizer "campo: -" no relatório é pior que não
 * dizer nada.
 */
export interface Falha {
  questaoId: string;
  url: string;
  /** Vem do buscador quando é rede/endereço; fixo quando é formato ou R2. */
  motivo: string;
}

export interface ResultadoDaRepatriacao {
  questoesAlteradas: number;
  imagensBaixadas: number;
  imagensJaNoR2: number;
  falhas: Falha[];
}

/** Os campos de texto de uma questão que podem conter imagem. */
export const CAMPOS_DE_TEXTO = [
  'textoQuestao',
  'pergunta',
  'textoAlternativaA',
  'textoAlternativaB',
  'textoAlternativaC',
  'textoAlternativaD',
  'textoAlternativaE',
] as const;
