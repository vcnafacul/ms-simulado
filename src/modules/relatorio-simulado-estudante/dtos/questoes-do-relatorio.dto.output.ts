import { ApiProperty } from '@nestjs/swagger';

export class QuestaoDoRelatorioDtoOutput {
  /**
   * Nulo em DOIS casos indistinguíveis um do outro:
   *
   * 1. A questão está vinculada à prova sem posição definida ainda (o admin
   *    tirou o número na aba Classificação). Na prática um simulado com
   *    questão sem número não é liberado, mas a leitura não presume.
   * 2. O vínculo questão↔prova foi DESFEITO depois que os cartões foram lidos
   *    (Etapa 11 — `removerDeProva`). As respostas continuam no `Historico` e
   *    a agregação por questão as conta normalmente, mas
   *    `getNumerosDasQuestoes` lê `Simulado.questoes` HOJE — a questão não
   *    está mais lá, então não entra no `Map`, e a linha chega com `numero:
   *    null` como se estivesse só sem posição.
   *
   * Em ambos, a questão vai para o fim da lista em vez de sumir — a tela não
   * pode assumir uma causa específica a partir só do `null`.
   */
  @ApiProperty({ required: true, nullable: true })
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
   *
   * ⚠️ **Latente, mas documentado**: hoje o gravador só emite A–E ou ausente,
   * então isto nunca acontece na prática — mas o cálculo não impede. Um
   * `alternativaEstudante` fora de A–E (ex.: `'F'`, lixo de leitura) some
   * de `porAlternativa` (nenhuma chave A–E o conta) e ainda assim conta como
   * `erro` — então `acertos + erros + semLeitura === respondentes` continua
   * batendo, mas `sum(porAlternativa) !== respondentes - semLeitura`. Uma
   * string vazia (`''`) tem o mesmo destino: o `$ifNull` só pega chave
   * ausente/`null`, não `''`, então ela também vira `erro`, não `semLeitura`.
   * A tela NÃO pode assumir `sum(porAlternativa) + semLeitura === respondentes`.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description:
      'Contagem por alternativa. Chaves A, B, C, D, E — cada uma sempre presente, mesmo com 0.',
  })
  porAlternativa: Record<string, number>;
}

export class QuestoesDoRelatorioDtoOutput {
  @ApiProperty({ type: [QuestaoDoRelatorioDtoOutput] })
  questoes: QuestaoDoRelatorioDtoOutput[];
}
