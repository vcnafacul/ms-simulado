export interface SubAproveitamento {
  id: string;
  nome: string;
  aproveitamento: number;
}

export abstract class Aproveitamento {
  public geral: number;
  public materias: SubAproveitamento[];
  public frentes: SubAproveitamento[];
}
