import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CadernoTemplate } from './caderno-template.schema';
import {
  CadernoTemplateService,
  RespostaDoRascunho,
} from './caderno-template.service';
import { UploadRascunhoDto } from './dtos/upload-rascunho.dto';
import { extrairTemplateDoZip, LIMITES } from './extrair-zip';
import { montarZipDeTeste } from './teste/zip-de-teste';

/**
 * A superfície HTTP do template do caderno.
 *
 * ⚠️ **Não há auth aqui.** O ms-simulado não tem guard próprio: `criadorId`
 * chega no corpo, injetado pelo api-vcnafacul a partir do JWT — mesmo padrão
 * de `prova/dtos/create.dto.input.ts`. Quem protege estas rotas é o card 12.
 *
 * ⚠️ **`GET /template/teste` vem antes de qualquer `GET /:algo`.** Hoje não
 * há rota com parâmetro solto neste controller, então não colide com nada; se
 * um dia houver, `teste` tem de continuar declarada antes, ou o zip modelo
 * vira "versão chamada teste" e o cliente leva 400.
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
   * O zip modelo: o template escolhido, com uma prova fabricada dentro.
   *
   * Fecha o ciclo do card 10 — o que sai daqui, editado no Overleaf, é o que
   * volta pelo `POST /rascunho`. Serve também para conferir uma versão antiga
   * antes de restaurá-la.
   *
   * Sem parâmetro sai a publicada; `?versao=N` uma específica; `?rascunho=1`
   * o rascunho em edição.
   *
   * ⚠️ **Leitura pura.** Nenhum método de escrita do serviço é alcançado.
   * Uma versão anterior gravava `testadoEm` a cada download; saiu quando
   * compilar no Overleaf virou passo obrigatório por construção.
   */
  @Get('teste')
  @Header('Content-Type', 'application/zip')
  async zipDeTeste(
    @Query('versao') versao: string | undefined,
    @Query('rascunho') rascunho: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // ⚠️ `!== undefined`, não truthiness: `?rascunho=` chega como string
    // vazia, que é falsy. Com `if (rascunho)` o parâmetro vazio cairia na
    // publicada em silêncio, que é exatamente o que a validação abaixo existe
    // para impedir.
    const pediuRascunho = rascunho !== undefined;
    const pediuVersao = versao !== undefined;

    if (pediuVersao && pediuRascunho) {
      throw new BadRequestException(
        'Escolha um só: "versao" ou "rascunho". Os dois juntos são ambíguos.',
      );
    }

    let origem: CadernoTemplate;

    if (pediuRascunho) {
      // ⚠️ Só `1` e `true`. Qualquer outro valor é 400, e nunca a publicada
      // por engano: este projeto já se queimou com `z.coerce.boolean()`
      // tratando `"false"` como `true`, e devolver a versão errada sem sinal
      // nenhum é o defeito que este endpoint existe para evitar.
      if (rascunho !== '1' && rascunho !== 'true') {
        throw new BadRequestException(
          `"rascunho" só aceita 1 ou true; recebi "${rascunho}".`,
        );
      }
      origem = await this.service.rascunho();
      if (!origem) {
        throw new NotFoundException(
          'Não há rascunho do template do caderno. Envie um zip do Overleaf.',
        );
      }
    } else if (pediuVersao) {
      // ⚠️ Validado à mão, e não com `ParseIntPipe`: `versao` é opcional, e o
      // pipe cru rejeitaria a AUSÊNCIA junto com o lixo — mas a ausência é o
      // caso normal, que usa a publicada.
      if (/^\d+$/.test(versao) === false) {
        throw new BadRequestException(
          `"versao" tem de ser um número inteiro; recebi "${versao}".`,
        );
      }
      origem = await this.service.porVersao(Number(versao));
    } else {
      origem = await this.service.publicada();
    }

    const nome = pediuRascunho
      ? 'template-teste-rascunho.zip'
      : `template-teste-v${origem.versao}.zip`;

    const buffer = await montarZipDeTeste(origem.arquivos);

    res.set({ 'Content-Disposition': `attachment; filename="${nome}"` });

    return new StreamableFile(buffer);
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
