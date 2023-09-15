import { Simulado } from 'src/modules/simulado/simulado.schema';
import { RespostaRelatorio } from './resposta-relatorio.model';

export class Relatorio {
  constructor(
    public _id: string,
    public estudante: number,
    public simulado: Simulado,
    public respostas: RespostaRelatorio[],
    public aproveitamento: number,
  ) {}
}
