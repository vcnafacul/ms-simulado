import { RespostaRelatorio } from "src/models/resposta-relatorio.model";
import { Simulado } from "src/models/simulado.model"

export class Relatorio {
    constructor(
        public _id: string,
        public estudante: number,
        public simulado: Simulado,
        public respostas: RespostaRelatorio[],
        public aproveitamento: number
    ) { }
}
