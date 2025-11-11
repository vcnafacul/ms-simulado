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
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { AuditLog } from '../auditLog/auditLog.schema';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { QuestaoAllDTO } from './dtos/questao.all.dto.output';
import { QuestaoDTOInput } from './dtos/questao.dto.input';
import { UpdateClassificacaoDTOInput } from './dtos/update-classificacao.dto.input';
import { UpdateContentDTOInput } from './dtos/update-content.dto.input';
import { UpdateImageAlternativaDTOInput } from './dtos/update-image-alternativa.dto.input';
import { UpdateImageIdDTOInput } from './dtos/update-image-id.dto.input';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';
import { QuestaoService } from './questao.service';

@ApiTags('Questao')
@Controller('v1/questao')
export class QuestaoController {
  constructor(private readonly service: QuestaoService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'get gestões por status',
    type: QuestaoAllDTO,
    isArray: true,
  })
  public async getAll(
    @Query() query: QuestaoDTOInput,
  ): Promise<GetAllDtoOutput<QuestaoAllDTO>> {
    return await this.service.getAll(query);
  }

  @Get('canInsert')
  public async canInsertQuestion(
    @Query('provaId') provaId: string,
    @Query('numero') numero: number,
    @Query('frente1') frente1: string,
  ): Promise<boolean> {
    return await this.service.canInsertQuestion(provaId, numero, frente1);
  }

  @Get('infos')
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Questao,
    isArray: true,
  })
  //precisamos criar dto pra isso
  public async getInfos(): Promise<any> {
    return await this.service.getInfos();
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

  @Get('summary')
  async getSummary() {
    return await this.service.getSummary();
  }

  @Get(':id/logs')
  @ApiResponse({
    status: 200,
    description: 'buscar logs da questão por id',
    type: AuditLog,
    isArray: true,
  })
  public async getLogs(@Param('id') id: string): Promise<AuditLog[]> {
    return await this.service.getLogs(id);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'buscar questão por id',
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

  @Patch(':id/classification')
  @ApiResponse({
    status: 200,
    description: 'atualizar classificação da questão',
    type: Questao,
    isArray: false,
  })
  public async updateClassificacao(
    @Param('id') id: string,
    @Body() classificacao: UpdateClassificacaoDTOInput,
  ) {
    await this.service.updateClassificacao(id, classificacao);
  }

  @Patch(':id/content')
  @ApiResponse({
    status: 200,
    description: 'atualizar conteúdo da questão',
    type: Questao,
    isArray: false,
  })
  public async updateContent(
    @Param('id') id: string,
    @Body() content: UpdateContentDTOInput,
  ) {
    await this.service.updateContent(id, content);
  }

  @Patch(':id/image-id')
  @ApiResponse({
    status: 200,
    description: 'atualizar imageId da questão',
    type: Questao,
    isArray: false,
  })
  public async updateImageId(
    @Param('id') id: string,
    @Body() imageId: UpdateImageIdDTOInput,
  ) {
    await this.service.updateImageId(id, imageId);
  }

  @Patch(':id/image-alternativa')
  @ApiResponse({
    status: 200,
    description: 'atualizar imagem da alternativa da questão',
    type: Questao,
    isArray: false,
  })
  public async updateImageAlternativa(
    @Param('id') id: string,
    @Body() imageAlternativa: UpdateImageAlternativaDTOInput,
  ) {
    await this.service.updateImageAlternativa(id, imageAlternativa);
  }

  @Patch(':id/:status')
  public async updateStatus(
    @Param('id') id: string,
    @Param('status') status: Status,
    @Body() body: { message: string; userId: string },
  ) {
    await this.service.updateStatus(id, status, body.userId, body.message);
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
