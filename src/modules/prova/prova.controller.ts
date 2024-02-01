import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProvaService } from './prova.service';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { Prova } from './prova.schema';

@ApiTags('Prova')
@Controller('v1/prova')
export class ProvaController {
  constructor(private readonly service: ProvaService) {}

  @Post()
  @ApiResponse({
    status: 201,
    description: 'cria prova',
    type: Prova,
    isArray: false,
  })
  public async post(@Body() dto: CreateProvaDTOInput): Promise<Prova> {
    return await this.service.create(dto);
  }

  @Get()
  @ApiResponse({
    status: 200,
    description: 'busca todas as provas',
    type: Prova,
    isArray: true,
  })
  public async getAll(): Promise<Prova[]> {
    return await this.service.getAll();
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'busca prova por id',
    type: Prova,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Prova> {
    return await this.service.getById(id);
  }

  @Get('missing/:id')
  @ApiResponse({
    status: 200,
    description: 'buscas quais questões faltam',
    type: Prova,
    isArray: false,
  })
  public async getMissing(@Param('id') id: string): Promise<number[]> {
    return await this.service.getMissingNumber(id);
  }
}
