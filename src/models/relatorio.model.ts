import { RespostaRelatorio } from "src/models/resposta-relatorio.model";
import { ISimulado } from "src/models/simulado.model"

export class Relatorio {
    constructor(
        public _id: string,
        public estudante: number,
        public simulado: ISimulado,
        public respostas: RespostaRelatorio[],
        public aproveitamento: number
    ) { }
}
