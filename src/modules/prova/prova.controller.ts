import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetAllDTOOutput } from './dtos/get-all.dto.output';
import { Prova } from './prova.schema';
import { ProvaService } from './prova.service';

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
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<GetAllDTOOutput>> {
    return await this.service.getAll(query);
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
    return await this.service.getMissingNumbers(id);
  }
}
