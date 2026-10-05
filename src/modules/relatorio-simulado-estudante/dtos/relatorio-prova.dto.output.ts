import { ApiProperty } from '@nestjs/swagger';
import { LinhaRelatorioDtoOutput } from './relatorio-simulado.dto.output';
import { QuestaoDoRelatorioDtoOutput } from './questoes-do-relatorio.dto.output';

/** Um simulado da prova que tem cartão no recorte (tickets/034). */
export class SimuladoDoRelatorioDtoOutput {
  @ApiProperty() simuladoId: string;

  /** `null` quando o simulado foi apagado depois dos cartões — R6. */
  @ApiProperty({ required: true, nullable: true }) nome: string | null;

  /** Cartões DO RECORTE neste simulado. */
  @ApiProperty() cartoes: number;

  @ApiProperty() totalDeQuestoes: number;
}

/**
 * O relatório de uma prova: as linhas de todos os simulados dela, no recorte.
 *
 * ⚠️ **Uma linha por APLICAÇÃO** (estudante × simulado), decidido no card 00 —
 * o estudante com cartão em dois simulados aparece duas vezes, cada linha com o
 * seu `simuladoId`.
 */
export class RelatorioProvaDtoOutput {
  @ApiProperty({ type: [LinhaRelatorioDtoOutput] })
  linhas: LinhaRelatorioDtoOutput[];

  /** ESTUDANTES distintos do cursinho com cartão em algum simulado da prova. */
  @ApiProperty()
  totalEstudantesComCartaoNoCursinho: number;

  /**
   * Questões da PROVA. Com simulados de composições diferentes cada linha tem
   * o seu total em `simulados[].totalDeQuestoes`.
   */
  @ApiProperty()
  totalDeQuestoes: number;

  @ApiProperty({ required: true, nullable: true })
  provaNome: string | null;

  @ApiProperty({ required: true, nullable: true })
  ultimoCartaoEm: Date | null;

  @ApiProperty({ type: [SimuladoDoRelatorioDtoOutput] })
  simulados: SimuladoDoRelatorioDtoOutput[];

  /**
   * Todos os simulados com cartão no recorte têm o MESMO conjunto de questões.
   * `false` = a média junta provas diferentes, e a tela tem de dizer (R3).
   */
  @ApiProperty()
  mesmasQuestoes: boolean;
}

export class QuestoesDaProvaDtoOutput {
  @ApiProperty({ type: [QuestaoDoRelatorioDtoOutput] })
  questoes: QuestaoDoRelatorioDtoOutput[];

  /** Ver `RelatorioProvaDtoOutput.mesmasQuestoes`. `false` ⇒ discriminação `null`. */
  @ApiProperty()
  mesmasQuestoes: boolean;
}
