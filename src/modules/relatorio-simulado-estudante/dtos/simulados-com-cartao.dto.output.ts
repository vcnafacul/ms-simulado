import { ApiProperty } from '@nestjs/swagger';

export class SimuladoComCartaoDtoOutput {
  @ApiProperty()
  simuladoId: string;

  /**
   * `null` quando o `Simulado` foi apagado depois do vínculo. A entrada
   * **não** some da lista: os cartões existem, e escondê-los seria o oposto
   * do que o relatório serve para fazer.
   */
  @ApiProperty({ nullable: true })
  nome: string | null;

  /** Quantos ESTUDANTES enviaram — o grão da junção é o estudante, não a tentativa. */
  @ApiProperty()
  cartoes: number;

  @ApiProperty()
  comLeituraConcluida: number;

  /**
   * Quando o estudante mais recente entrou no recorte. O `registrar` é upsert,
   * então reenvio do mesmo estudante NÃO move esta data — não exibir como
   * "última atividade".
   */
  @ApiProperty({ nullable: true })
  ultimoEnvio: Date | null;
}

export class SimuladosComCartaoDtoOutput {
  @ApiProperty({ type: [SimuladoComCartaoDtoOutput] })
  simulados: SimuladoComCartaoDtoOutput[];
}
