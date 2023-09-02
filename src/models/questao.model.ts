import { Exame } from 'src/models/exame.model'
import { Frente } from 'src/models/frente.model'
import { Materia } from 'src/models/materia.model'

export class Questao {
  constructor(
    public _id: string,
    public exame: Exame,
    public ano: number,
    public caderno: string,
    public enemArea: string,
    public frente1: Frente,
    public frente2: Frente,
    public frente3: Frente,
    public materia: Materia,
    public numero: number,
    public textoQuestao: string,
    public textoAlternativaA: string,
    public textoAlternativaB: string,
    public textoAlternativaC: string,
    public textoAlternativaD: string,
    public textoAlternativaE: string,
    public alternativa: string,
    public imageId: string,
    public acertos: number,
    public quantidadeSimulado: number,
    public quantidadeResposta: number
  ) { }
}
