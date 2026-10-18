import { ApiProperty } from '@nestjs/swagger';
import { EnemArea } from '../enums/enem-area.enum';
import { Status } from '../enums/status.enum';

export class QuestaoAllDTO {
  @ApiProperty()
  public _id?: string;

  @ApiProperty()
  public provasContendo: {
    provaId: string;
    provaNome: string;
    numero: number | null;
  }[];

  @ApiProperty({ required: false, nullable: true })
  public provaBase?: string | null;

  @ApiProperty()
  public enemArea: EnemArea;

  @ApiProperty()
  public materia: string;

  @ApiProperty()
  public status: Status;

  @ApiProperty()
  public updatedAt: Date;

  /** tickets/042: anulada em alguma prova (o espelho). */
  @ApiProperty({ required: false })
  public anulada?: boolean;

  @ApiProperty({ required: false })
  public qtdAnulacoes?: number;
}
