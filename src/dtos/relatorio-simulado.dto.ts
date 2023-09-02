import { ApiProperty } from "@nestjs/swagger"
import { RespostaRelatorio } from "src/models/resposta-relatorio.model"
import { Simulado } from "src/models/simulado.model"


export class RelatorioSimuladoDto {
  @ApiProperty()
  estudante: number

  @ApiProperty()
  simulado: Simulado

  @ApiProperty()
  respostas: RespostaRelatorio[]

  @ApiProperty()
  aproveitamento: number
}