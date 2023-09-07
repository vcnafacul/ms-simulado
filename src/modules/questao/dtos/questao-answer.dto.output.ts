import { Exame } from '../..//exame/exame.schema';
import { Caderno } from '../enums/caderno.enum';
import { EnemArea } from '../enums/enem-area.enum';
import { Frente } from '../../frente/frente.schema';
import { Materia } from '../..//materia/materia.schema';
import { ApiProperty } from '@nestjs/swagger';

export class QuestaoAnswerDTOOutput {
  @ApiProperty()
  exame: Exame;

  @ApiProperty()
  public ano: number;

  @ApiProperty()
  public caderno: Caderno;

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

  @ApiProperty()
  public numero: number;

  @ApiProperty()
  public imageId: string;
}
