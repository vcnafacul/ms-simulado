import { TipoSimuladoSchema } from "./tipo-simulado.schema";
import { ExameSchema } from "../modules/exame/exame.schema";
import { FrenteSchema } from "./frente.schema";
import { MateriaSchema } from "./materia.schema";
import { QuestaoSchema } from "./questao.schema";
import { RelatorioSchema } from "./relatorio.schema";
import { SimuladoSchema } from "./simulado.schema";


export const AllSchemas = [
  { name: 'Frente', schema: FrenteSchema },
  { name: 'Materia', schema: MateriaSchema },
  { name: 'Questao', schema: QuestaoSchema },
  { name: 'Relatorio', schema: RelatorioSchema },
  { name: 'TipoSimulado', schema: TipoSimuladoSchema },
  { name: 'Simulado', schema: SimuladoSchema },
];
