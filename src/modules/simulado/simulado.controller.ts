import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { Simulado } from './schemas/simulado.schema';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { AnswerSimulado } from './dtos/answer-simulado.dto.input';

@ApiTags('Simulado')
@Controller('v1/simulado')
export class SimuladoController {
  constructor(private readonly service: SimuladoService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'buscar todos simulados cadastrados',
    type: Simulado,
    isArray: true,
  })
  public async getAll(): Promise<Simulado[]> {
    return await this.service.getAll();
  }

  @Get('toanswer/:id')
  @ApiResponse({
    status: 200,
    description: 'get simuldo para responder por id',
    type: SimuladoAnswerDTOOutput,
    isArray: false,
  })
  public async getToAnswer(@Param('id') id: string) {
    return await this.service.getToAnswer(id);
  }

  @Post('answer')
  public async answer(@Body() answer: AnswerSimulado) {
    await this.service.answer(answer);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'get simulado by ID',
    type: Simulado,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Simulado> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
