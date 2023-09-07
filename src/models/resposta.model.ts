import { Questao } from 'src/modules/questao/questao.schema';

export class Resposta {
  constructor(
    public questao: Questao,
    public resposta: string,
  ) {}
}
