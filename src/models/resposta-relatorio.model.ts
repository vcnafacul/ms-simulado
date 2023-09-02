import { Questao } from "src/models/questao.model"

export class RespostaRelatorio {
    constructor(
        public questao: Questao,
        public respostaEstudante: string,
        public alternativaCorreta: string
    ) { }
}
