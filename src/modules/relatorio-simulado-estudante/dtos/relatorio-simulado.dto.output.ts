import { ApiProperty } from '@nestjs/swagger';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { FalhaDescrita } from '../../historico/falha/mapa-falha';

export class LinhaRelatorioDtoOutput {
  @ApiProperty() usuario: string;

  @ApiProperty({ required: false }) turmaId?: string;

  /** O card 07 usa para abrir o detalhe do estudante. */
  @ApiProperty() historicoId: string;

  @ApiProperty({ enum: HistoricoStatus }) status: HistoricoStatus;

  @ApiProperty({ required: false }) cartaoCode?: string;

  @ApiProperty({ required: false }) questoesRespondidas?: number;

  /**
   * AUSENTE, não zero, quando não há leitura concluída. Zero é uma nota;
   * ausência de leitura não é — iguais, a média do card 04 mente.
   */
  @ApiProperty({ required: false }) aproveitamentoGeral?: number;

  @ApiProperty({ required: false }) falha?: FalhaDescrita;
}

export class RelatorioSimuladoDtoOutput {
  @ApiProperty({ type: [LinhaRelatorioDtoOutput] })
  linhas: LinhaRelatorioDtoOutput[];

  /**
   * Denominador do rodapé do relatório por turma: "27 dos 30 cartões deste
   * simulado são desta turma". No relatório geral do cursinho é sempre igual
   * a `linhas.length`.
   *
   * Renomeado de `totalCartoesDoCursinhoNoSimulado` (revisão adversarial,
   * Fix 7): conta LINHAS da junção, e o índice único faz disso uma linha por
   * ESTUDANTE — um estudante que reenvia depois de uma falha continua
   * contando 1. A proporção é correta (numerador e denominador têm o mesmo
   * grão), só o nome antigo dizia "cartões" quando é gente.
   */
  @ApiProperty()
  totalEstudantesComCartaoNoCursinho: number;
}
