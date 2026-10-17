import { ApiProperty } from '@nestjs/swagger';

/** Uma anulada do recorte (tickets/042, card 13). */
export class AnuladaDoRelatorioDtoOutput {
  @ApiProperty() numero: number;
  @ApiProperty() motivo: string;
  @ApiProperty() justificativa: string;
}

/** O aviso de relatório desatualizado: só consulta (R3). */
export class AnulacaoDoRelatorioDtoOutput {
  @ApiProperty({
    description:
      'linhas concluídas calculadas antes da última anulação/desanulação',
  })
  divergentes: number;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'o recálculo em andamento, se houver (card 12)',
  })
  jobAtivo: unknown | null;
}

export const SEM_DISCRIMINACAO = ['divergente', 'composicao'] as const;
export type SemDiscriminacao = (typeof SEM_DISCRIMINACAO)[number];
