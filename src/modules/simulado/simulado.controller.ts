import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { Simulado } from './simulado.schema';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Simulado')
@Controller('v1/simulado')
export class SimuladoController {
  constructor(private readonly service: SimuladoService) {}

  @Get()
  public async getAll(): Promise<Simulado[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(@Body() idTipo: string): Promise<Simulado> {
    return await this.service.add(idTipo);
  }

  @Get('toanswer/:id')
  public async getToAnswer(@Param('id') id: string) {
    return await this.service.getToAnswer(id);
  }

  @Get('default')
  public async getDefaults() {
    return await this.service.getDefaults();
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<Simulado> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
