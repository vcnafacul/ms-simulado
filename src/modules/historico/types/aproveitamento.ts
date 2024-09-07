export interface SubAproveitamento {
  id: string;
  nome: string;
  aproveitamento: number;
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
