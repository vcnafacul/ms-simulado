/**
 * Idioma do simulado da prova ENEM do cursinho (tickets/038, R3).
 *
 * ⚠️ Campo, e não o nome: o nome da prova é digitado pelo cursinho — uma prova
 * "Simulado Inglês" geraria "Simulado Inglês Espanhol", e escolher o simulado
 * por `nome.includes('Inglês')` mandaria a questão de Inglês para os dois. É
 * também por este campo que o callback do cartão (card 13) acha o simulado do
 * idioma marcado.
 */
export enum Idioma {
  Ingles = 'Inglês',
  Espanhol = 'Espanhol',
}
