import { EnemArea } from '../enums/enem-area.enum';
import { Frente } from '../../frente/frente.schema';
import { Materia } from '../..//materia/materia.schema';
import { ApiProperty } from '@nestjs/swagger';

export class QuestaoAnswerDTOOutput {
  @ApiProperty()
  public enemArea: EnemArea;

  @ApiProperty()
  public frente1: Frente;

  @ApiProperty()
  public frente2?: Frente;

  @ApiProperty()
  public frente3?: Frente;

  @ApiProperty()
  public materia: Materia;

  @ApiProperty({ nullable: true })
  public numero: number | null;

  /** tickets/042 (D5): ausente em cliente/servidor antigo = válida. */
  @ApiProperty({ required: false })
  public anulada?: boolean;

  /** Sem imagem quando anulada. */
  @ApiProperty({ required: false })
  public imageId?: string;
}
