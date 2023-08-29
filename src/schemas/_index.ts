import { TipoSimuladoSchema } from "./TipoSimulado";
import { ExameSchema } from "./exame.schema";
import { FrenteSchema } from "./frente.schema";
import { MateriaSchema } from "./materia.schema";
import { QuestaoSchema } from "./questao.schema";
import { RelatorioSchema } from "./relatorio.schema";


export const AllSchemas = [
    { name: 'Exame', schema: ExameSchema },
    { name: 'Frente', schema: FrenteSchema },
    { name: 'Materia', schema: MateriaSchema },
    { name: 'Questao', schema: QuestaoSchema },
    { name: 'Relatorio', schema: RelatorioSchema },
    { name: 'TipoSimulado', schema: TipoSimuladoSchema },
];
