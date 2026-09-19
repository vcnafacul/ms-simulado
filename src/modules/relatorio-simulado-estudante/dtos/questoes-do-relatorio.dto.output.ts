import { ApiProperty } from '@nestjs/swagger';

export class QuestaoDoRelatorioDtoOutput {
  /**
   * Nulo quando a questão está vinculada à prova sem posição definida. Na
   * prática um simulado com questão sem número não é liberado, mas a leitura
   * não presume: a questão vai para o fim da lista em vez de sumir.
   */
  @ApiProperty({ required: false, nullable: true })
  numero: number | null;

  @ApiProperty() questaoId: string;

  @ApiProperty() respondentes: number;

  @ApiProperty() acertos: number;

  @ApiProperty() erros: number;

  /**
   * NÃO é "em branco". O ms-omr descarta tanto a questão não marcada quanto a
   * dupla marcação, e as duas chegam indistinguíveis — chamar de "em branco"
   * afirmaria o que ninguém verificou, e é o número que o professor usa para
   * decidir o que revisar em aula.
   */
  @ApiProperty() semLeitura: number;

  /**
   * Contagem por alternativa A–E. Contagem, não percentual: percentual
   * arredondado soma 99% ou 101%, e a tela divide melhor do que o ms adivinha.
   */
  @ApiProperty({ type: Object })
  porAlternativa: Record<string, number>;
}

export class QuestoesDoRelatorioDtoOutput {
  @ApiProperty({ type: [QuestaoDoRelatorioDtoOutput] })
  questoes: QuestaoDoRelatorioDtoOutput[];
}
