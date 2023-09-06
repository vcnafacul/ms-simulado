import { ApiProperty } from '@nestjs/swagger';
import { Alternativa } from 'src/enums/alternativa.enum';
import { Caderno } from 'src/enums/caderno.enum';
import { EnemArea } from 'src/enums/enem-area.enum';

export class CreateQuestaoDTOInput {
  @ApiProperty()
  exameId: string;

  @ApiProperty()
  public ano: number;

  @ApiProperty()
  public caderno: Caderno;

  @ApiProperty()
  public enemArea: EnemArea;

  @ApiProperty()
  public frente1Id: string;

  @ApiProperty({ required: false })
  public frente2Id: string;

  @ApiProperty({ required: false })
  public frente3Id: string;

  @ApiProperty()
  public materiaId: string;

  @ApiProperty()
  public numero: number;

  @ApiProperty({ required: false })
  public textoQuestao: string;

  @ApiProperty()
  public textoAlternativaA: string;

  @ApiProperty()
  public textoAlternativaB: string;

  @ApiProperty()
  public textoAlternativaC: string;

  @ApiProperty()
  public textoAlternativaD: string;

  @ApiProperty()
  public textoAlternativaE: string;

  @ApiProperty()
  public alternativa: Alternativa;

  @ApiProperty()
  public imageId: string;
}
