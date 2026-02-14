import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
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
  public async post(
    @Body() dto: CreateProvaDTOInput,
  ): Promise<GetProvaDTOOutout> {
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
  ): Promise<GetAllDtoOutput<GetProvaDTOOutout>> {
    return await this.service.getAll(query);
  }

  @Get('summary')
  async getSummary() {
    return await this.service.getSummary();
  }

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({
    status: 202,
    description: 'Inicia sincronizacao em background',
  })
  @ApiResponse({
    status: 409,
    description: 'Sincronizacao ja em andamento',
  })
  public startSync() {
    return this.service.startSync();
  }

  @Get('sync/report')
  @ApiResponse({
    status: 200,
    description: 'Retorna o relatorio da ultima sincronizacao',
  })
  public getSyncReport() {
    return this.service.getSyncReport();
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
