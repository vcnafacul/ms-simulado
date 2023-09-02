import { Regra } from "src/models/regra.model"

export class TipoSimulado {
    constructor(
        public nome: string,
        public duracao: number,
        public quantidadeTotalQuestao: number,
        public regras: Regra[],
        public id?: string
    ) { }
}
