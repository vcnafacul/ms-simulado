import { ApiProperty } from "@nestjs/swagger";

import { Frente } from "src/models/frente.model"
import { Materia } from "src/models/materia.model"
import { Exame } from "src/modules/exame/exame.schema";

export class QuestaoOutputDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  exame: Exame

  @ApiProperty()
  ano: number

  @ApiProperty()
  caderno: string

  @ApiProperty()
  enemArea: string

  @ApiProperty()
  frente1: Frente

  @ApiProperty()
  frente2: Frente

  @ApiProperty()
  frente3: Frente

  @ApiProperty()
  materia: Materia

  @ApiProperty()
  numero: number

  @ApiProperty()
  imageId: string
}