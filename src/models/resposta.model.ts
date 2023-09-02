import { Questao } from './questao.model'

export class Resposta {
    constructor(
        public questao: Questao,
        public resposta: string
    ) { }
}
