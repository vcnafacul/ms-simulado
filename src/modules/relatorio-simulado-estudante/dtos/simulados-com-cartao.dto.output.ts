import { ApiProperty } from '@nestjs/swagger';

export class SimuladoComCartaoDtoOutput {
  @ApiProperty()
  simuladoId: string;

  /**
   * `null` só se o documento do `Simulado` sumir da coleção. O delete da
   * aplicação é **soft** (`deleted: true`), e o nome continua vindo — de
   * propósito: esconder cartões que existem é pior que rotulá-los.
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
