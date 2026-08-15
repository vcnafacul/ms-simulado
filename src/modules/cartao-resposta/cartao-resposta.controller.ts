import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TemplateProvisionService } from './template-provision.service';

@ApiTags('cartao-resposta')
@Controller('v1/cartao-resposta')
export class CartaoRespostaController {
  constructor(private readonly provision: TemplateProvisionService) {}

  @Get(':simuladoId')
  @Header('Content-Type', 'application/pdf')
  async getCartao(
    @Param('simuladoId') simuladoId: string,
  ): Promise<StreamableFile> {
    const pdf = await this.provision.obterPdf(simuladoId);
    return new StreamableFile(pdf);
  }
}
