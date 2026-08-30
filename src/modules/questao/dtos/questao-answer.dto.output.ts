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

  @ApiProperty()
  public imageId: string;
}
