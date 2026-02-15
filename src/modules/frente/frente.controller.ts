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
import {
  CreateFrenteDTOInput,
  UpdateFrenteDTOInput,
} from './dtos/create.dto.input';
import { Frente } from './frente.schema';
import { FrenteService } from './frente.service';

@ApiTags('Frente')
@Controller('v1/frente')
export class FrenteController {
  constructor(private readonly service: FrenteService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'lista de frentes cadastradas',
    type: Frente,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Frente>> {
    return await this.service.getAll(query);
  }

  @Post()
  @ApiResponse({
    status: 201,
    description: 'frente criada com sucesso',
    type: Frente,
  })
  public async post(@Body() model: CreateFrenteDTOInput): Promise<Frente> {
    return await this.service.add(model);
  }

  @Get('materia/:materiaId')
  @ApiResponse({
    status: 200,
    description: 'frentes por matéria',
    type: Frente,
    isArray: true,
  })
  public async getByMateria(
    @Param('materiaId') materiaId: string,
  ): Promise<Frente[]> {
    return await this.service.getByMateria(materiaId);
  }

  @Get('materiawithcontent/:materiaId')
  @ApiResponse({
    status: 200,
    description: 'frentes com conteúdos aprovados por matéria',
  })
  public async getByMateriaWithApprovedContent(
    @Param('materiaId') materiaId: string,
  ): Promise<any[]> {
    return await this.service.getByMateriaWithApprovedContent(materiaId);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'frente por ID',
    type: Frente,
  })
  public async getById(@Param('id') id: string): Promise<Frente> {
    return await this.service.getById(id);
  }

  @Patch(':id')
  @ApiResponse({
    status: 200,
    description: 'frente atualizada com sucesso',
  })
  public async update(
    @Param('id') id: string,
    @Body() model: UpdateFrenteDTOInput,
  ): Promise<void> {
    return await this.service.update(id, model);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
