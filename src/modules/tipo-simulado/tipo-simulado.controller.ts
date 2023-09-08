import { Body, Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { TipoSimuladoService } from './tipo-simulado.service';
import { CreateTipoSimuladoDTOInput } from './dtos/create.dto.input';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TipoSimulado } from './schemas/tipo-simulado.schema';

@ApiTags('Tipo Simulado')
@Controller('tipo-simulado')
export class TipoSimuladoController {
  constructor(private readonly service: TipoSimuladoService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: TipoSimulado,
    isArray: true,
  })
  public async getAll(): Promise<TipoSimulado[]> {
    return await this.service.getAll();
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastrado com sucesso',
    type: TipoSimulado,
    isArray: false,
  })
  public async post(
    @Body() model: CreateTipoSimuladoDTOInput,
  ): Promise<TipoSimulado> {
    return await this.service.add(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: TipoSimulado,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<TipoSimulado> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
