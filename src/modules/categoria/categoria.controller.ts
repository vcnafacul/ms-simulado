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
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { CategoriaOutputDTO } from './dtos/categoria-output.dto';
import { Categoria } from './schemas/categoria.schema';
import { CategoriaService } from './categoria.service';

@ApiTags('Categoria')
@Controller('v1/categoria')
export class CategoriaController {
  constructor(private readonly service: CategoriaService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: CategoriaOutputDTO,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<CategoriaOutputDTO>> {
    return await this.service.getAll(query);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastrado com sucesso',
    type: Categoria,
    isArray: false,
  })
  public async post(
    @Body() model: CreateCategoriaDTOInput,
  ): Promise<Categoria> {
    return await this.service.add(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: CategoriaOutputDTO,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<CategoriaOutputDTO | null> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
