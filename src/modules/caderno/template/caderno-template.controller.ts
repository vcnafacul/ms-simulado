import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CadernoTemplate } from './caderno-template.schema';
import {
  CadernoTemplateService,
  RespostaDoRascunho,
} from './caderno-template.service';
import { UploadRascunhoDto } from './dtos/upload-rascunho.dto';
import { extrairTemplateDoZip, LIMITES } from './extrair-zip';

/**
 * A superfície HTTP do template do caderno.
 *
 * ⚠️ **Não há auth aqui.** O ms-simulado não tem guard próprio: `criadorId`
 * chega no corpo, injetado pelo api-vcnafacul a partir do JWT — mesmo padrão
 * de `prova/dtos/create.dto.input.ts`. Quem protege estas rotas é o card 12.
 *
 * ⚠️ **`GET /template/teste` não mora aqui** — é do card 11, apesar de
 * aparecer no fluxo desenhado no card 10.
 */
@ApiTags('caderno-template')
@Controller('v1/caderno/template')
export class CadernoTemplateController {
  constructor(private readonly service: CadernoTemplateService) {}

  /** A versão em uso. 503 quando não há nenhuma publicada — decisão do serviço. */
  @Get()
  async getPublicada(): Promise<CadernoTemplate> {
    return await this.service.publicada();
  }

  /** O rascunho em edição. */
  @Get('rascunho')
  async getRascunho(): Promise<CadernoTemplate> {
    const rascunho = await this.service.rascunho();
    if (!rascunho) {
      throw new NotFoundException(
        'Não há rascunho do template do caderno. Envie um zip do Overleaf.',
      );
    }
    return rascunho;
  }

  /**
   * Sobe o zip do projeto do Overleaf: extrai, lint-a e salva como rascunho.
   *
   * ⚠️ **Erro de lint devolve 200 com os erros no corpo, nunca 4xx.** O
   * rascunho é salvo assim mesmo. Um 4xx faria o cliente descartar o corpo e
   * a pessoa perder o zip que acabou de editar no Overleaf — o pior resultado
   * possível deste fluxo. Quem recusa é o `publicar`, com 409.
   *
   * ⚠️ **400 é só quando a EXTRAÇÃO falha**: não é zip, zip bomb, sem
   * `main.tex`. Aí não há o que salvar.
   *
   * ⚠️ `HttpCode(200)` explícito: o padrão do Nest para POST é 201, e o
   * contrato acordado com o card 12 é 200.
   */
  @Post('rascunho')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['arquivo', 'criadorId'],
      properties: {
        arquivo: { type: 'string', format: 'binary' },
        criadorId: { type: 'string' },
        notas: { type: 'string' },
      },
    },
  })
  // ⚠️ O `fileSize` aqui é a SEGUNDA trava do zip bomb; a primeira é a de
  // `extrairTemplateDoZip`. As duas existem porque esta corta antes de o
  // corpo inteiro entrar na memória do processo, e a outra é a que tem teste.
  @UseInterceptors(
    FileInterceptor('arquivo', { limits: { fileSize: LIMITES.zipBytes } }),
  )
  async subirRascunho(
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() dto: UploadRascunhoDto,
  ): Promise<RespostaDoRascunho> {
    if (!arquivo || !arquivo.buffer) {
      throw new BadRequestException(
        'Envie o zip do projeto do Overleaf no campo "arquivo".',
      );
    }

    const extraido = await extrairTemplateDoZip(arquivo.buffer);
    // ⚠️ `=== false`: com `strictNullChecks: false` o TS não estreita união
    // por negação, e sem isto `extraido.arquivos` abaixo não compila.
    if (extraido.ok === false) {
      throw new BadRequestException(extraido.erro);
    }

    return await this.service.salvarRascunho({
      arquivos: extraido.arquivos,
      ignorados: extraido.ignorados,
      criadorId: dto.criadorId,
      notas: dto.notas ?? '',
    });
  }

  /** Joga o rascunho fora. 404 quando não havia nada — não finge que apagou. */
  @Delete('rascunho')
  @HttpCode(HttpStatus.NO_CONTENT)
  async descartarRascunho(): Promise<void> {
    await this.service.descartarRascunho();
  }

  /** Promove o rascunho a publicada. 409 quando não há rascunho ou o lint barra. */
  @Post('rascunho/publicar')
  async publicar(): Promise<CadernoTemplate> {
    return await this.service.publicar();
  }

  /** O histórico, já em ordem decrescente — a ordenação é do repositório. */
  @Get('versoes')
  async versoes(): Promise<CadernoTemplate[]> {
    return await this.service.versoes();
  }

  /**
   * Restaurar **cria um rascunho** a partir de uma versão antiga; publicar
   * depois gera número novo. Nenhum ponteiro anda para trás.
   *
   * ⚠️ **`ParseIntPipe` no `:n`.** Sem ele `/versoes/abc/restaurar` chega
   * como string, a comparação com `versao` no Mongo não casa e o cliente leva
   * 404 — "essa versão não existe" — quando o certo é 400. Um `_id` de Mongo
   * nesta rota não existe, então o `ObjectIdPipe` do api não se aplica.
   *
   * ⚠️ `notas` do corpo é ignorado de propósito: quem escreve a nota de um
   * rascunho restaurado é o serviço ("Restaurado da versão N").
   */
  @Post('versoes/:n/restaurar')
  async restaurar(
    @Param('n', ParseIntPipe) n: number,
    @Body() dto: UploadRascunhoDto,
  ): Promise<void> {
    await this.service.restaurar(n, dto.criadorId);
  }
}
