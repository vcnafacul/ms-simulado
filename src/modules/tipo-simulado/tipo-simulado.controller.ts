import { Body, Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { TipoSimuladoService } from './tipo-simulado.service';
import { TipoSimuladoDTOOutput } from './dtos/tipo-simulado.dto.output';
import { CreateTipoSimuladoDTOInput } from './dtos/create.dto.input';

@Controller('tipo-simulado')
export class TipoSimuladoController {
  constructor(private readonly service: TipoSimuladoService) {}

  @Get()
  public async getAll(): Promise<TipoSimuladoDTOOutput[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(
    @Body() model: CreateTipoSimuladoDTOInput,
  ): Promise<TipoSimuladoDTOOutput> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById(
    @Param('id') id: string,
  ): Promise<TipoSimuladoDTOOutput> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
