export interface SubAproveitamento {
  id: string;
  nome: string;
  aproveitamento: number;
  /**
   * Quantas questões do simulado tocam esta matéria (ou frente) — o
   * denominador do `aproveitamento` (card 30).
   *
   * ⚠️ **As bases NÃO somam o total do simulado, e isso é esperado.** Desde o
   * card 14 uma questão conta inteira em cada (matéria, frente) que ela toca, e
   * 928 das 1.616 frentes secundárias de homologação são de matéria diferente
   * da questão. Uma prova de 10 questões pode ter 13 vínculos.
   *
   * É por isso que este campo existe: sem ele, "Álgebra 60%" não diz de
   * quantas, e quem somar as matérias acha que a conta não fecha.
   *
   * ⚠️ **Opcional, e ausente ≠ zero.** Histórico gravado antes deste card não
   * tem a contagem, e ela é irrecuperável — o `criaAproveitamento` calculava o
   * total para dividir e descartava. Zero afirmaria "nenhuma questão desta
   * matéria", que é outra coisa.
   *
   * ⚠️ **NÃO confundir com `MediaPorMateria.base`**, que conta ESTUDANTES no
   * resumo da turma. Aqui são questões. Por isso o nome é `questoes`.
   */
  questoes?: number;
}

export interface FrenteAproveitamento extends SubAproveitamento {
  materia: string;
}

export interface MateriaAproveitamento extends SubAproveitamento {
  frentes: FrenteAproveitamento[];
}
export abstract class AproveitamentoHistorico {
  public geral: number;
  public materias: MateriaAproveitamento[];
}

export abstract class AproveitamentoGeral {
  geral: number;
  materias: SubAproveitamento[];
  frentes: SubAproveitamento[];
}
