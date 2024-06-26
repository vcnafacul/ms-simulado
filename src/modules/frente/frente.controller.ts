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
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateFrenteDTOInput } from './dtos/create.dto.input';
import { Frente } from './frente.schema';
import { FrenteService } from './frente.service';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';

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
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Frente>> {
    return await this.service.getAll(query);
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
