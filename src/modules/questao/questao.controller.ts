import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { QuestaoService } from './questao.service';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Questao } from './questao.schema';
import { ReportDTO } from './dtos/report.dto.input';
import { Status } from './enums/status.enum';
/* import { Questao } from './questao.schema'; */

@ApiTags('Questao')
@Controller('v1/questao')
export class QuestaoController {
  constructor(private readonly service: QuestaoService) {}

  @Get(':status')
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Questao,
    isArray: true,
  })
  public async getAll(@Param('status') status: Status): Promise<Questao[]> {
    return await this.service.getAll(status);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Questao,
    isArray: false,
  })
  public async post(@Body() model: CreateQuestaoDTOInput): Promise<Questao> {
    return await this.service.add(model);
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
}
