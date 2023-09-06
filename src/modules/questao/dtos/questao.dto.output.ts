import { ApiProperty } from '@nestjs/swagger';
import { Alternativa } from 'src/enums/alternativa.enum';
import { Caderno } from 'src/enums/caderno.enum';
import { EnemArea } from 'src/enums/enem-area.enum';
import { Exame } from 'src/modules/exame/exame.schema';
import { Frente } from 'src/modules/frente/frente.schema';
import { Materia } from 'src/modules/materia/materia.schema';

export class QuestaoDTOOutput {
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

  @ApiProperty()
  public acertos: number;

  @ApiProperty()
  public quantidadeSimulado: number;

  @ApiProperty()
  public quantidadeResposta: number;
}
