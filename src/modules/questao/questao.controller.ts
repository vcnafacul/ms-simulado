import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { QuestaoDTOOutput } from './dtos/questao.dto.output';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Questao')
@Controller('v1/questao')
export class QuestaoController {
  constructor(private readonly service: QuestaoService) {}

  @Get()
  public async getAll(): Promise<QuestaoDTOOutput[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(
    @Body() model: CreateQuestaoDTOInput,
  ): Promise<QuestaoDTOOutput> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<QuestaoDTOOutput> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
