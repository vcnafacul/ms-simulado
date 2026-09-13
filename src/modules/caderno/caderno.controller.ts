import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CadernoService } from './caderno.service';
import { CadernoDtoInput, decodificarLogos } from './dtos/logos.dto.input';

@ApiTags('caderno')
@Controller('v1/caderno')
export class CadernoController {
  constructor(private readonly caderno: CadernoService) {}

  /**
   * @deprecated Substituído pelo `postCaderno`. Vivo só até o api estar em
   * produção mandando POST — ver o docblock de lá. Não estender.
   *
   * ⚠️ **O param é restrito a um ObjectId, e isso não é decoração.**
   *
   * Sem a restrição, `:simuladoId` casa com qualquer segmento — inclusive o
   * literal `template` das rotas do `CadernoTemplateController`, que vive em
   * `v1/caderno/template`. Como o `CadernoModule` é registrado antes no
   * `app.module.ts`, ele ganhava a disputa e `GET /v1/caderno/template` caía
   * aqui, com `simuladoId = "template"` — e morria num
   * `CastError: Cast to ObjectId failed for value "template"` lá no
   * `SimuladoRepository.getById`.
   *
   * Restringir o param é melhor do que reordenar os módulos: ordem de array é
   * acoplamento invisível, e uma ordenação alfabética a desfaz em silêncio.
   * Com o padrão aqui, `template` simplesmente não casa, e a ordem deixa de
   * importar.
   *
   * Custo aceito: um `simuladoId` malformado passa a dar 404 em vez de chegar
   * ao serviço. O cliente sempre manda ids de uma lista, e recusar mais cedo é
   * mais seguro do que recusar depois.
   */
  @Get(':simuladoId([0-9a-fA-F]{24})')
  @Header('Content-Type', 'application/zip')
  async getCaderno(
    @Param('simuladoId') simuladoId: string,
    @Query('draft') draft: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // ⚠️ Só a string exata "true". Query string chega como texto, e tratar
    // "presente" como ligado faria `?draft=false` LIGAR o rascunho — defeito
    // que aparece como uma marca d'água que ninguém pediu.
    const { nome, buffer, avisos } = await this.caderno.gerarZip(simuladoId, {
      draft: draft === 'true',
    });

    res.set({
      'Content-Disposition': `attachment; filename="${nome}"`,
      'X-Caderno-Avisos': String(avisos),
    });

    return new StreamableFile(buffer);
  }

  /**
   * A rota que o api usa desde o card 13.
   *
   * ⚠️ **O `GET` acima continua existindo, e não é sobra.** Os dois serviços
   * sobem em deploys separados: se o api subisse antes mandando POST, todo
   * download de caderno morreria em 404 até o segundo deploy terminar. Com o
   * GET vivo, qualquer ordem funciona e o pior caso é um caderno sem logos por
   * alguns minutos. Remover é card próprio, depois dos dois em produção.
   *
   * ⚠️ Mesma restrição de param do GET, pelo mesmo motivo: sem ela o literal
   * `template` das rotas do `CadernoTemplateController` casa aqui.
   */
  @Post(':simuladoId([0-9a-fA-F]{24})')
  @Header('Content-Type', 'application/zip')
  async postCaderno(
    @Param('simuladoId') simuladoId: string,
    @Query('draft') draft: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @Body() corpo?: CadernoDtoInput,
  ): Promise<StreamableFile> {
    // ⚠️ Requisição sem corpo nenhum: o `@Body()` entrega undefined quando não há
    // body parser aplicável. O `corpo?.` existe para isto.
    // Mesma regra do GET; o porquê está no comentário de lá.
    const { nome, buffer, avisos } = await this.caderno.gerarZip(simuladoId, {
      draft: draft === 'true',
      logos: decodificarLogos(corpo?.logos),
    });

    res.set({
      'Content-Disposition': `attachment; filename="${nome}"`,
      'X-Caderno-Avisos': String(avisos),
    });

    return new StreamableFile(buffer);
  }
}
