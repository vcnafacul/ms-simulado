import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CadernoService } from './caderno.service';

@ApiTags('caderno')
@Controller('v1/caderno')
export class CadernoController {
  constructor(private readonly caderno: CadernoService) {}

  @Get(':simuladoId')
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
}
