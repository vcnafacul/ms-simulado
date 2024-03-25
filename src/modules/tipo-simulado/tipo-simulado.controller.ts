import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllOutput } from 'src/shared/base/interfaces/IBaseRepository';
import { GetAllDtoInput } from 'src/shared/dtos/getall.dto.input';
import { CreateTipoSimuladoDTOInput } from './dtos/create.dto.input';
import { TipoSimulado } from './schemas/tipo-simulado.schema';
import { TipoSimuladoService } from './tipo-simulado.service';

@ApiTags('Tipo Simulado')
@Controller('v1/tipo-simulado')
export class TipoSimuladoController {
  constructor(private readonly service: TipoSimuladoService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: TipoSimulado,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllOutput<TipoSimulado>> {
    return await this.service.getAll(query);
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
