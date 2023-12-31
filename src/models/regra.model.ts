import { Materia } from "src/models/materia.model"
import { Frente } from "src/models/frente.model"

export class Regra {
    constructor(
        public materia: Materia,
        public quantidade: number,
        public frente: Frente | null,
        public ano: number | null,
        public caderno: string | null
    ) { }
}
