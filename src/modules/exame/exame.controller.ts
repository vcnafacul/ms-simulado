import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ExameService } from './exame.service';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Exame } from './exame.schema';
import { CreateExameDtoInput } from './dtos/create.dto.input';
import {
  GetAllInput,
  GetAllOutput,
} from 'src/shared/base/interfaces/IBaseRepository';

@ApiTags('Exame')
@Controller('v1/exame')
export class ExameController {
  constructor(private readonly service: ExameService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'lista de exames cadastrados e validos',
    type: Exame,
    isArray: true,
  })
  public async getAll(param: GetAllInput): Promise<GetAllOutput<Exame>> {
    return await this.service.getAll(param);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Exame,
    isArray: false,
  })
  public async post(@Body() model: CreateExameDtoInput): Promise<Exame> {
    return await this.service.add(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Exame,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Exame> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    await this.service.delete(id);
  }
}
