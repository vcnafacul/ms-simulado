import { Frente } from 'src/modules/frente/frente.schema';
import { Materia } from 'src/modules/materia/materia.schema';
import { Alternativa } from 'src/modules/questao/enums/alternativa.enum';
import { Questao } from 'src/modules/questao/questao.schema';

export interface RespostaAproveitamento {
  questao: Questao;
  alternativaEstudante: Alternativa;
  alternativaCorreta: Alternativa;
  materia: Materia;
  frente: Frente;
  /**
   * Fora da análise (tickets/042, D2): sai do numerador E do denominador no
   * geral, na matéria e na frente.
   */
  anulada?: boolean;
}
