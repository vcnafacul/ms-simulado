import { ApiProperty } from '@nestjs/swagger';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { FalhaDescrita } from '../../historico/falha/mapa-falha';

export class FrenteDoEstudanteDtoOutput {
  @ApiProperty() id: string;
  @ApiProperty() nome: string;
  /** Fração de 0 a 1, como `aproveitamentoGeral` — a tela é quem formata. */
  @ApiProperty() aproveitamento: number;
}

export class MateriaDoEstudanteDtoOutput {
  @ApiProperty() id: string;
  @ApiProperty() nome: string;
  @ApiProperty() aproveitamento: number;
  @ApiProperty({ type: [FrenteDoEstudanteDtoOutput] })
  frentes: FrenteDoEstudanteDtoOutput[];
}

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

  /**
   * Nota por matéria, com as frentes dentro. É o que responde "em QUÊ o aluno
   * foi mal" — a pergunta que o relatório não respondia e que decide o que o
   * coordenador faz na segunda-feira.
   *
   * ⚠️ **Opcional, e ausente nunca vira `[]`.** Histórico de antes do
   * `criaAproveitamento`, leitura não concluída, ou cartão em que nenhuma
   * questão casou com matéria: nos três a lista vazia faria a tela desenhar
   * barra em zero e afirmar que o aluno zerou TODAS as matérias. Ausência de
   * medida não é medida zero.
   */
  @ApiProperty({ required: false, type: [MateriaDoEstudanteDtoOutput] })
  aproveitamentoPorMateria?: MateriaDoEstudanteDtoOutput[];

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
