import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateMateriaDTOInput } from './dtos/create.dto.input';
import { UpdateMateriaDTOInput } from './dtos/update.dto.input';
import { Materia } from './materia.schema';
import { MateriaService } from './materia.service';

@ApiTags('Materia')
@Controller('v1/materia')
export class MateriaController {
  constructor(private readonly service: MateriaService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: Materia,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Materia>> {
    return await this.service.getAll(query);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastrado com sucesso',
    type: Materia,
    isArray: false,
  })
  public async post(@Body() model: CreateMateriaDTOInput): Promise<Materia> {
    return await this.service.add(model);
  }

  @Get('grouped-by-area')
  @ApiResponse({
    status: 200,
    description: 'materias agrupadas por área do ENEM',
  })
  public async getGroupedByArea() {
    return await this.service.getGroupedByArea();
  }

  @Get(':id/can-delete')
  @ApiResponse({
    status: 200,
    description: 'indica se a matéria pode ser excluída (sem frentes nem questões vinculadas)',
  })
  public async canDelete(@Param('id') id: string) {
    return await this.service.validateCanDelete(id);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materia cadastradas e valida',
    type: Materia,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Materia> {
    return await this.service.getById(id);
  }

  @Patch(':id')
  @ApiResponse({
    status: 200,
    description: 'materia atualizada com sucesso',
    type: Materia,
  })
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateMateriaDTOInput,
  ): Promise<Materia> {
    return await this.service.update(id, dto);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
