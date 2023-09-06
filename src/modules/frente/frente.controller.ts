import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { FrenteService } from './frente.service';
import { FrenteDTOOutput } from './dtos/frente.dto.output';
import { CreateFrenteDTOInput } from './dtos/create.dto.input';

@Controller('v1/frente')
export class FrenteController {
  constructor(private readonly service: FrenteService) {}

  @Get()
  public async getAll(): Promise<FrenteDTOOutput[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post(
    @Body() model: CreateFrenteDTOInput,
  ): Promise<FrenteDTOOutput> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById(@Param('id') id: string): Promise<FrenteDTOOutput> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
