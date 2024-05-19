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
export abstract class Aproveitamento {
  public geral: number;
  public materias: MateriaAproveitamento[];
}
