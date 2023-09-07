import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { ApiTags } from '@nestjs/swagger';
import { Questao } from './questao.schema';
/* import { Questao } from './questao.schema'; */

@ApiTags('Questao')
@Controller('v1/questao')
export class QuestaoController {
  constructor(private readonly service: QuestaoService) {}

  @Get()
  public async getAll(): Promise<Questao[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(@Body() model: CreateQuestaoDTOInput): Promise<Questao> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<Questao> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
