import { Questao } from 'src/models/questao.model'
import { TipoSimulado } from "src/models/tipo-simulado.model"

export class Simulado {
  constructor(
    public nome: string,
    public descricao: string,
    public tipo: TipoSimulado,
    public questoes: Questao[],
    public aproveitamento: number,
    public vezesRespondido: number,
    public bloqueado: boolean,
    public _id:string
  ) { }

}
