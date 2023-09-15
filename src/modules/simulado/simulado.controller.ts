import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { Simulado } from './simulado.schema';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateSimuladoDTOInput } from './dtos/create.dto.input';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { AnswerSimulado } from './dtos/answer-simulado.dto.input';

@ApiTags('Simulado')
@Controller('v1/simulado')
export class SimuladoController {
  constructor(private readonly service: SimuladoService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: Simulado,
    isArray: true,
  })
  public async getAll(): Promise<Simulado[]> {
    return await this.service.getAll();
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: Simulado,
    isArray: false,
  })
  public async post(@Body() dto: CreateSimuladoDTOInput): Promise<Simulado> {
    return await this.service.add(dto);
  }

  @Get('toanswer/:id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
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

  @Get('default')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'string',
      },
    },
  })
  public async getDefaults() {
    return await this.service.getDefaults();
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
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
