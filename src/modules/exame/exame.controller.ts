import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ExameService } from './exame.service';
import { ApiTags } from '@nestjs/swagger';
import { Exame } from './exame.schema';
import { CreateExameDtoInput } from './dtos/create.dto.input';

@ApiTags('Exame')
@Controller('v1/exame')
export class ExameController {
  constructor(private readonly service: ExameService) {}

  @Get()
  public async getAll(): Promise<Exame[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(@Body() model: CreateExameDtoInput): Promise<Exame> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<Exame> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    await this.service.delete(id);
  }
}
