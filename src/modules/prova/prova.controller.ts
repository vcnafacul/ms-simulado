import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Delete,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { DuplicarProvaDTOInput } from './dtos/duplicar.dto.input';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { GetProvaDTOOutout } from './dtos/get-all.dto.output';
import { Prova } from './prova.schema';
import { ProvaService } from './prova.service';
import { ProvaGestaoService } from './gestao/prova-gestao.service';
import { EditarDadosProvaDTOInput } from './dtos/editar-dados.dto.input';
import { UpdateProvaFilesDTO } from './dtos/update-files.dto.input';
import { AplicarAtualizacoesDTOInput } from './dtos/aplicar-atualizacoes.dto.input';
import { ReceberNovasVersoesDTOInput } from './dtos/receber-novas-versoes.dto.input';
import { Ator, AtorDaRequisicao } from 'src/shared/ator/ator';

@ApiTags('Prova')
@Controller('v1/prova')
export class ProvaController {
  constructor(
    private readonly service: ProvaService,
    private readonly gestao: ProvaGestaoService,
  ) {}

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

  /** tickets/027, card 01 — mesmas questões, mesmos números, origem guardada. */
  @Post(':id/duplicar')
  @ApiResponse({ status: 201, description: 'duplica a prova do cursinho' })
  public async duplicar(
    @Param('id') id: string,
    @Body() dto: DuplicarProvaDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<GetProvaDTOOutout> {
    return await this.service.duplicar(id, dto.nome.trim(), ator);
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

  @Get('cursinho/:cursinhoId')
  @ApiResponse({
    status: 200,
    description: 'busca provas de um cursinho',
    type: Prova,
    isArray: true,
  })
  public async getAllByCursinho(
    @Param('cursinhoId') cursinhoId: string,
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<GetProvaDTOOutout>> {
    return await this.service.getAllByCursinho(cursinhoId, query);
  }

  @Get('summary')
  async getSummary() {
    return await this.service.getSummary();
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'busca prova por id',
    type: Prova,
    isArray: false,
  })
  public async getById(
    @Param('id') id: string,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<Prova | null> {
    return await this.service.getByIdComDono(id, ator);
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

  /** tickets/023, card 13 — ler é livre; `podeComporProva` diz se aplica. */
  @Get(':id/atualizacoes')
  @ApiResponse({ status: 200, description: 'atualizações das questões' })
  public async listarAtualizacoes(
    @Param('id') id: string,
    @AtorDaRequisicao() ator?: Ator,
  ) {
    return await this.service.listarAtualizacoes(id, ator);
  }

  /** tickets/023, card 14 — só o dono; tudo ou nada. */
  @Post(':id/atualizacoes')
  @ApiResponse({ status: 201, description: 'aplica versões novas na prova' })
  public async aplicarAtualizacoes(
    @Param('id') id: string,
    @Body() dto: AplicarAtualizacoesDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ) {
    return await this.service.aplicarAtualizacoes(id, dto.trocas, ator);
  }

  /** tickets/023, card 05 — só o dono (403 com o motivo). */
  @Patch(':id/receber-novas-versoes')
  @ApiResponse({ status: 200, description: 'aplicar novas versões na prova' })
  public async alterarReceberNovasVersoes(
    @Param('id') id: string,
    @Body() dto: ReceberNovasVersoesDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<{ receberNovasVersoes: boolean }> {
    return await this.service.alterarReceberNovasVersoes(id, dto.valor, ator);
  }

  @Patch(':id/files')
  @ApiResponse({
    status: 200,
    description: 'Atualiza arquivos da prova',
    type: Prova,
    isArray: false,
  })
  public async updateFiles(
    @Param('id') id: string,
    @Body() dto: UpdateProvaFilesDTO,
  ): Promise<GetProvaDTOOutout> {
    return await this.service.updateFiles(id, dto);
  }

  /**
   * Card 41 — o cursinho corrige nome, ano, edição, aplicação e categoria da
   * prova dele. Só o dono (`x-ator`); a permissão é checada na api.
   */
  @Patch(':id/dados')
  @ApiResponse({ status: 200, description: 'edita os dados da prova' })
  public async editarDados(
    @Param('id') id: string,
    @Body() dto: EditarDadosProvaDTOInput,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<{ nome: string }> {
    return await this.gestao.editar(id, dto, ator);
  }

  /** Card 41 — exclusão lógica; só sem cartão enviado. */
  @Delete(':id')
  @ApiResponse({ status: 200, description: 'exclui a prova do cursinho' })
  public async excluir(
    @Param('id') id: string,
    @AtorDaRequisicao() ator?: Ator,
  ): Promise<{ nome: string }> {
    return await this.gestao.excluir(id, ator);
  }
}
