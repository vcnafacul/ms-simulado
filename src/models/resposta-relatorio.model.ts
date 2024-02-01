import { Questao } from 'src/modules/questao/questao.schema';

export class RespostaRelatorio {
  constructor(
    public questao: Questao,
    public respostaEstudante: string,
    public alternativaCorreta: string,
  ) {}
}
