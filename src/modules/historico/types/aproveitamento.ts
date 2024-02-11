interface Frente {
  id: string;
  nome: string;
  aprovaitamento: number;
}

interface Materia {
  id: string;
  nome: string;
  aproveitamento: number;
  frentes: Frente[];
}

export abstract class Aproveitamento {
  public geral: number;
  public materias: Materia[];
}
