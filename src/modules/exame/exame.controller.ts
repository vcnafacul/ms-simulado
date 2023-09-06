import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ExameService } from './exame.service';
import { ExameDto } from './dtos/exame.dto';

@Controller('v1/exame')
export class ExameController {
  constructor(
    private readonly service: ExameService,
  ) { }

  @Get()
  public async getAll (): Promise<ExameDto[]> {
    return await this.service.getAll();
  }

  @Post()
  public async post (@Body() model: ExameDto): Promise<ExameDto> {
    return await this.service.add(model);
  }

  @Get(':id')
  public async getById (@Param('id') id: string): Promise<ExameDto> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete (@Param('id') id: string): Promise<ExameDto> {
    return await this.service.delete(id);
  }
}
