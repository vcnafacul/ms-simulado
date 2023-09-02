import { ApiProperty } from "@nestjs/swagger";
import { Exame } from "src/models/exame.model"
import { Frente } from "src/models/frente.model"
import { Materia } from "src/models/materia.model"

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