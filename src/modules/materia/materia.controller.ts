import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { MateriaService } from './materia.service';
import { MateriaDTOOutput } from './dtos/materia.dto.output';
import { CreateMateriaDTOInput } from './dtos/create.dto.input';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Materia')
@Controller('v1/materia')
export class MateriaController {
  constructor(private readonly service: MateriaService) {}

  @Get()
  public async getAll(): Promise<MateriaDTOOutput[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(
    @Body() model: CreateMateriaDTOInput,
  ): Promise<MateriaDTOOutput> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<MateriaDTOOutput> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
