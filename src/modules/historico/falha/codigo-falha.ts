/**
 * O que o cursinho pode fazer a respeito. Valores fechados de propósito: é isto
 * que o card 09 usa para decidir se a ação de reenvio aparece, e é o que mantém
 * a regra num lugar só, em vez de um `if` sobre códigos em cada tela.
 */
export enum AcaoSugerida {
  /** Falhou a infraestrutura, não a imagem — a mesma foto serve numa nova tentativa. */
  Reprocessar = 'reprocessar',
  /** A foto precisa mudar: enquadramento, iluminação, marcadores cortados. */
  ReenviarFoto = 'reenviar_foto',
  /** Nada que o cursinho faça resolve. */
  FalarComSuporte = 'falar_com_suporte',
}

/**
 * Códigos que ESTE serviço produz.
 *
 * Os outros oito chegam do ms-omr e NÃO são enumerados aqui de propósito: validar
 * contra uma lista fechada faria todo código novo daquele repo exigir deploy
 * coordenado. Quem absorve o desconhecido é o fallback do mapa.
 * Contrato do ms-omr: `README.md` de github.com/vcnafacul/ms-omr.
 */
export enum CodigoFalhaInterno {
  OmrIndisponivel = 'omr_indisponivel',
  SimuladoNaoEncontrado = 'simulado_nao_encontrado',
  RespostasAusentes = 'respostas_ausentes',
  SimuladoSemQuestoes = 'simulado_sem_questoes',
  ErroNoProcessamento = 'erro_no_processamento',
}
