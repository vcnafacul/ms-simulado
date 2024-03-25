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
import { CreateExameDtoInput } from './dtos/create.dto.input';
import { Exame } from './exame.schema';
import { ExameService } from './exame.service';

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
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Exame>> {
    return await this.service.getAll(query);
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
