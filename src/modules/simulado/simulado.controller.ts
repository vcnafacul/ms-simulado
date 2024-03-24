import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Query,
} from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { Simulado } from './schemas/simulado.schema';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { AnswerSimuladoDto } from './dtos/answer-simulado.dto.input';
import { AvailableSimuladoDTOoutput } from './dtos/available-simulado.dto.output';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

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
  public async getAll(
    @Query() query: GetAllInput,
  ): Promise<GetAllOutput<Simulado>> {
    return await this.service.getAll(query);
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
  public async answer(@Body() answer: AnswerSimuladoDto) {
    await this.service.answer(answer);
  }

  @Get('available')
  public async getAvailable(
    @Query('tipo') tipo: string,
  ): Promise<AvailableSimuladoDTOoutput[]> {
    return await this.service.getAvailable(tipo);
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
