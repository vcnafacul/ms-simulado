import { ApiProperty } from '@nestjs/swagger';
import { EnemArea } from '../enums/enem-area.enum';
import { Status } from '../enums/status.enum';

export class QuestaoAllDTO {
  @ApiProperty()
  public _id?: string;

  @ApiProperty()
  public prova: string;

  @ApiProperty()
  public enemArea: EnemArea;

  @ApiProperty()
  public materia: string;

  @ApiProperty()
  public numero: number;

  @ApiProperty()
  public status: Status;

  @ApiProperty()
  public updatedAt: Date;
}
