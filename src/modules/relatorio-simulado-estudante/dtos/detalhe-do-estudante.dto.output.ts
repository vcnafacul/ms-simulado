import { ApiProperty } from '@nestjs/swagger';
import { Alternativa } from '../../questao/enums/alternativa.enum';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { FalhaDescrita } from '../../historico/falha/mapa-falha';

/**
 * ⚠️ **Três estados, não dois.** Juntar "não marcou" com "marcou errado"
 * distorce exatamente a leitura que o professor faz para decidir o que revisar
 * em aula.
 *
 * ⚠️ E é `sem_leitura`, não `em_branco`: o `cartao_reader.py` do ms-omr só
 * emite questão cuja leitura é UMA letra A–E, descartando `""` e `"AE"`
 * igualmente. Branco e dupla marcação chegam indistinguíveis — chamar de
 * "em branco" afirma o que ninguém verificou.
 */
export enum ResultadoDaQuestao {
  Acerto = 'acerto',
  Erro = 'erro',
  SemLeitura = 'sem_leitura',
}

export class RespostaDoEstudanteDtoOutput {
  /**
   * `null` tem DOIS significados, e os dois vão para o fim da lista:
   * a questão está no simulado **sem posição**, ou o vínculo dela com o
   * simulado foi **desfeito depois** de o estudante responder — o `numero` vem
   * do simulado de hoje, a resposta ficou gravada no histórico. Não dá para
   * distinguir os dois aqui, e para a leitura em tela tanto faz: nos dois
   * casos a questão existe, não tem lugar na ordem, e sumir com ela seria pior
   * que mostrá-la fora de ordem. Mesma regra de
   * `QuestaoDoRelatorioDtoOutput.numero`.
   */
  @ApiProperty({ required: true, nullable: true })
  numero: number | null;

  @ApiProperty()
  questaoId: string;

  /** AUSENTE quando não houve leitura — não vazio, não nulo. */
  @ApiProperty({ required: false, enum: Alternativa })
  alternativaEstudante?: Alternativa;

  @ApiProperty({ required: false, enum: Alternativa })
  alternativaCorreta?: Alternativa;

  @ApiProperty({ enum: ResultadoDaQuestao })
  resultado: ResultadoDaQuestao;
}

export class DetalheDoEstudanteDtoOutput {
  @ApiProperty({ enum: HistoricoStatus })
  status: HistoricoStatus;

  /** Só quando `status === 'failed'` — ver o serviço. */
  @ApiProperty({ required: false })
  falha?: FalhaDescrita;

  @ApiProperty({ type: [RespostaDoEstudanteDtoOutput] })
  respostas: RespostaDoEstudanteDtoOutput[];
}
