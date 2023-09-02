import { Document } from "mongoose"

import { Questao } from 'src/models/questao.model'
import { TipoSimulado } from "src/models/tipo-simulado.model"

export interface ISimulado extends Document {
  nome: string
  descricao: string
  tipo: TipoSimulado
  questoes: Questao[]
  aproveitamento: number
  vezesRespondido: number
  bloqueado: boolean
}
