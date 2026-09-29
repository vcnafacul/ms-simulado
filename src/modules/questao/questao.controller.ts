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
import { AdicionarEmProvaDTOInput } from './dtos/adicionar-em-prova.dto.input';
import { DefinirProvaBaseDTOInput } from './dtos/definir-prova-base.dto.input';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { SinalizarRevisaoDTOInput } from './dtos/sinalizar-revisao.dto.input';
import { Status } from './enums/status.enum';
import { ProvaContendo } from './questao.repository';
import { Questao } from './questao.schema';
import { QuestaoService } from './questao.service';
import { Ator, AtorDaRequisicao } from 'src/shared/ator/ator';

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
  public async getInfos(@AtorDaRequisicao() ator?: Ator): Promise<any> {
    return await this.service.getInfos(ator);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastro de questao',
    type: Questao,
    isArray: false,
  })
  public async post(
    @Body() model: CreateQuestaoDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<Questao> {
    return await this.service.create(model, ator);
  }

  @Get('summary')
  async getSummary() {
    return await this.service.getSummary();
  }

  // tickets/025, card 02. ⚠️ Literal antes das rotas `:id/...`.
  @Get('contador-cursinho/:cursinhoId')
  async getContadorCursinho(@Param('cursinhoId') cursinhoId: string) {
    return await this.service.questoesAprovadasDoCursinho(cursinhoId);
  }

  @Get('pending-by-materia')
  async getPendingByMateria(@Query('materias') materias?: string) {
    const materiaIds = materias
      ? materias.split(',').filter(Boolean)
      : undefined;
    return await this.service.getPendingByMateria(materiaIds);
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
  public async getById(
    @Param('id') id: string,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<(Questao & { provasContendo: ProvaContendo[] }) | null> {
    return await this.service.getById(id, ator);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'exclui (soft) uma questão órfã' })
  @ApiResponse({
    status: 409,
    description: 'não pode ser excluída — o corpo lista os motivos',
  })
  public async delete(
    @Param('id') id: string,
    // ⚠️ Query, e não corpo: o `delete` do axios da api não manda corpo.
    @Query('userId') userId?: string,
  ): Promise<void> {
    return await this.service.delete(id, userId);
  }

  @Get(':id/exclusao')
  @ApiResponse({
    status: 200,
    description: 'se a questão pode ser excluída, e os motivos se não',
  })
  public async podeExcluir(@Param('id') id: string) {
    return await this.service.podeExcluir(id);
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
    @AtorDaRequisicao() ator?: Ator,
  ) {
    await this.service.updateClassificacao(id, classificacao, ator);
  }

  @Post(':id/duplicar')
  @ApiResponse({
    status: 201,
    description: 'cria uma cópia editável da questão, com lastro',
    type: Questao,
  })
  @ApiResponse({ status: 404, description: 'questão não encontrada' })
  public async duplicar(
    @Param('id') id: string,
    @Body() body: { userId?: string },
  ) {
    return await this.service.duplicar(id, body?.userId);
  }

  @Patch(':id/nova-versao')
  @ApiResponse({
    status: 200,
    description:
      'congela esta questão e cria a sucessora já editada; as provas e simulados passam a apontar a nova',
    type: Questao,
  })
  @ApiResponse({ status: 400, description: 'questão já congelada' })
  @ApiResponse({ status: 404, description: 'questão não encontrada' })
  public async novaVersao(
    @Param('id') id: string,
    @Body() body: UpdateContentDTOInput,
  ) {
    return await this.service.novaVersao(id, body, body.userId);
  }

  @Get(':id/linhagem')
  @ApiResponse({
    status: 200,
    description:
      'a cadeia de versões, as cópias diretas e a origem desta questão',
  })
  public async linhagem(@Param('id') id: string) {
    return await this.service.linhagem(id);
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

  @Post(':id/provas')
  @ApiResponse({ status: 200, description: 'adiciona a questão a uma prova' })
  public async adicionarEmProva(
    @Param('id') id: string,
    @Body() body: AdicionarEmProvaDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<void> {
    await this.service.adicionarEmProva(
      id,
      body.provaId,
      body.numero,
      body.userId,
      ator,
    );
  }

  @Delete(':id/provas/:provaId')
  @ApiResponse({ status: 200, description: 'remove a questão de uma prova' })
  public async removerDeProva(
    @Param('id') id: string,
    @Param('provaId') provaId: string,
    @Query('userId') userId?: string,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<void> {
    await this.service.removerDeProva(id, provaId, userId, ator);
  }

  @Patch(':id/prova-base')
  @ApiResponse({ status: 200, description: 'define a provaBase da questão' })
  public async definirProvaBase(
    @Param('id') id: string,
    @Body() body: DefinirProvaBaseDTOInput,
  ): Promise<void> {
    await this.service.definirProvaBase(id, body.provaId, body.userId);
  }

  /** tickets/024, card 04 — pede à equipe da plataforma que revise. */
  @Post(':id/revisao')
  @ApiResponse({ status: 201, description: 'sinaliza a questão para revisão' })
  public async sinalizarRevisao(
    @Param('id') id: string,
    @Body() body: SinalizarRevisaoDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<void> {
    await this.service.sinalizarRevisao(id, body.motivo, ator);
  }

  @Patch(':id/:status')
  public async updateStatus(
    @Param('id') id: string,
    @Param('status') status: Status,
    @Body() body: { message: string; userId: string },
    @AtorDaRequisicao() ator?: Ator,
  ) {
    await this.service.updateStatus(
      id,
      status,
      body.userId,
      body.message,
      ator,
    );
  }

  @Patch()
  @ApiResponse({
    status: 200,
    description: 'update questao',
    type: Questao,
    isArray: false,
  })
  public async updateQuestion(
    @Body() question: UpdateDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ) {
    await this.service.updateQuestionDaRota(question, ator);
  }
}
