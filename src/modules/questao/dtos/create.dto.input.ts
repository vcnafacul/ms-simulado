import { ApiProperty } from '@nestjs/swagger';
import { Caderno } from '../enums/caderno.enum';
import { EnemArea } from '../enums/enem-area.enum';
import { Alternativa } from '../enums/alternativa.enum';

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
  public textoQuestao?: string;

  @ApiProperty({ required: false })
  public textoAlternativaA?: string;

  @ApiProperty({ required: false })
  public textoAlternativaB?: string;

  @ApiProperty({ required: false })
  public textoAlternativaC?: string;

  @ApiProperty({ required: false })
  public textoAlternativaD?: string;

  @ApiProperty({ required: false })
  public textoAlternativaE?: string;

  @ApiProperty()
  public alternativa: Alternativa;

  @ApiProperty()
  public imageId: string;
}
