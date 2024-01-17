import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Patch,
  Query,
} from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Questao } from './questao.schema';
import { ReportDTO } from './dtos/report.dto.input';
import { Status } from './enums/status.enum';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Paginate } from 'src/shared/paginate/paginate';
import { PaginateQuery } from 'src/shared/paginate/paginate-query';

@ApiTags('Questao')
@Controller('v1/questao')
export class QuestaoController {
  constructor(private readonly service: QuestaoService) {}

  @Get('infos')
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Questao,
    isArray: true,
  })
  public async getInfos() {
    return await this.service.getInfos();
  }

  @Get(':status')
  @ApiResponse({
    status: 200,
    description: 'get gestões por status',
    type: Questao,
    isArray: true,
  })
  public async getPaginateAll(
    @Query() query: PaginateQuery,
    @Param('status') status: Status,
  ): Promise<Paginate<Questao>> {
    return await this.service.getAll(query, status);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastro de questao',
    type: Questao,
    isArray: false,
  })
  public async post(@Body() model: CreateQuestaoDTOInput): Promise<Questao> {
    return await this.service.create(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Questao,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Questao> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }

  @Post('report')
  public async report(@Body() reportDTO: ReportDTO) {
    await this.service.report(reportDTO);
  }

  @Patch(':id/:status')
  public async updateStatus(
    @Param('id') id: string,
    @Param('status') status: Status,
  ) {
    await this.service.updateStatus(id, status);
  }

  @Patch()
  @ApiResponse({
    status: 200,
    description: 'update questao',
    type: Questao,
    isArray: false,
  })
  public async updateQuestion(@Body() question: UpdateDTOInput) {
    await this.service.updateQuestion(question);
  }
}
