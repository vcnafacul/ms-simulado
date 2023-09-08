import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { FrenteService } from './frente.service';
import { CreateFrenteDTOInput } from './dtos/create.dto.input';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Frente } from './frente.schema';

@ApiTags('Frente')
@Controller('v1/frente')
export class FrenteController {
  constructor(private readonly service: FrenteService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'lista de exames cadastrados e validos',
    type: Frente,
    isArray: true,
  })
  public async getAll(): Promise<Frente[]> {
    return await this.service.getAll();
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'lista de exames cadastrados e validos',
    type: Frente,
    isArray: false,
  })
  public async post(@Body() model: CreateFrenteDTOInput): Promise<Frente> {
    return await this.service.add(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'lista de exames cadastrados e validos',
    type: Frente,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Frente> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
