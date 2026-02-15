import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { Content } from './content.schema';
import { ContentService } from './content.service';
import { CreateContentDTOInput } from './dtos/create-content.dto.input';
import { GetAllContentDtoInput } from './dtos/get-all-content.dto.input';
import { UpdateStatusDTOInput } from './dtos/update-status.dto.input';
import { SnapshotContentStatus } from './snapshot/snapshot-content-status.schema';

@ApiTags('Content')
@Controller('v1/content')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Post()
  @ApiResponse({
    status: 201,
    description: 'conteúdo criado com sucesso',
    type: Content,
  })
  async create(@Body() model: CreateContentDTOInput): Promise<Content> {
    return await this.service.create(model);
  }

  @Get()
  @ApiResponse({
    status: 200,
    description: 'lista de conteúdos',
    type: Content,
    isArray: true,
  })
  async getAll(
    @Query() query: GetAllContentDtoInput,
  ): Promise<GetAllDtoOutput<Content>> {
    return await this.service.getAll(query);
  }

  @Get('demand')
  @ApiResponse({
    status: 200,
    description: 'conteúdos pendentes de upload',
    type: Content,
    isArray: true,
  })
  async getDemands(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Content>> {
    return await this.service.getDemands(query.page, query.limit);
  }

  @Get('summary')
  @ApiResponse({
    status: 200,
    description: 'resumo de conteúdos por status',
  })
  async getSummary() {
    return await this.service.getSummary();
  }

  @Get('stats-by-frente')
  @ApiResponse({
    status: 200,
    description: 'estatísticas de conteúdos agrupados por frente',
  })
  async getStatsByFrente() {
    return await this.service.getStatsByFrente();
  }

  @Get('snapshot-content-status')
  @ApiResponse({
    status: 200,
    description: 'snapshots históricos de status de conteúdos',
    type: SnapshotContentStatus,
    isArray: true,
  })
  async getSnapshotContentStatus(): Promise<SnapshotContentStatus[]> {
    return await this.service.getSnapshotContentStatus();
  }

  @Get('subject/:subjectId')
  @ApiResponse({
    status: 200,
    description: 'conteúdos por tema ordenados',
    type: Content,
    isArray: true,
  })
  async getBySubject(
    @Param('subjectId') subjectId: string,
  ): Promise<Content[]> {
    return await this.service.getBySubject(subjectId);
  }

  @Get(':id/populated')
  @ApiResponse({
    status: 200,
    description: 'conteúdo por ID com subject, frente e materia populados',
    type: Content,
  })
  async getByIdPopulated(@Param('id') id: string): Promise<Content> {
    return await this.service.getByIdPopulated(id);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'conteúdo por ID',
    type: Content,
  })
  async getById(@Param('id') id: string): Promise<Content> {
    return await this.service.getById(id);
  }

  @Patch(':id/status')
  @ApiResponse({
    status: 200,
    description: 'status do conteúdo atualizado',
  })
  async changeStatus(
    @Param('id') id: string,
    @Body() model: UpdateStatusDTOInput,
  ): Promise<void> {
    return await this.service.changeStatus(
      id,
      model.status,
      model.userId,
      model.message,
    );
  }

  @Patch(':id/reset')
  @ApiResponse({
    status: 200,
    description: 'conteúdo resetado para pendente de upload',
  })
  async reset(@Param('id') id: string): Promise<void> {
    return await this.service.reset(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
