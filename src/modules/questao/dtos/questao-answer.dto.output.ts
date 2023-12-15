import { EnemArea } from '../enums/enem-area.enum';
import { Frente } from '../../frente/frente.schema';
import { Materia } from '../..//materia/materia.schema';
import { ApiProperty } from '@nestjs/swagger';
import { Prova } from 'src/modules/prova/prova.schema';

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

  @ApiProperty()
  public numero: number;

  @ApiProperty()
  public imageId: string;

  @ApiProperty()
  public prova: Prova;
}
