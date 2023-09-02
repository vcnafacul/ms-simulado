import { ApiProperty } from "@nestjs/swagger"
import { QuestaoOutputDto } from "./questao-output.dto"


export class SimuladoDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  tipo: string

  @ApiProperty()
  questoes: QuestaoOutputDto[]

  @ApiProperty()
  nome: string

  @ApiProperty()
  descricao: string

  @ApiProperty()
  duracao: number

  @ApiProperty()
  inicio: Date
}