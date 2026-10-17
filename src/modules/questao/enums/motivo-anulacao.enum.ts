/**
 * Por que uma questão foi anulada numa prova (tickets/042, D3).
 *
 * ⚠️ A justificativa em texto é obrigatória em todos, inclusive `outro`: o
 * motivo é o filtro, o texto é o que o professor lê.
 */
export enum MotivoAnulacao {
  enunciadoComErro = 'enunciado_com_erro',
  semAlternativaCorreta = 'sem_alternativa_correta',
  maisDeUmaCorreta = 'mais_de_uma_correta',
  repetidaDeOutroExame = 'repetida_de_outro_exame',
  foraDoEdital = 'fora_do_edital',
  outro = 'outro',
}

export const ROTULO_DO_MOTIVO: Record<MotivoAnulacao, string> = {
  [MotivoAnulacao.enunciadoComErro]: 'Enunciado com erro',
  [MotivoAnulacao.semAlternativaCorreta]: 'Sem alternativa correta',
  [MotivoAnulacao.maisDeUmaCorreta]: 'Mais de uma alternativa correta',
  [MotivoAnulacao.repetidaDeOutroExame]: 'Repetida de outro exame',
  [MotivoAnulacao.foraDoEdital]: 'Fora do edital',
  [MotivoAnulacao.outro]: 'Outro',
};
