import { ApiProperty } from "@nestjs/swagger"


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