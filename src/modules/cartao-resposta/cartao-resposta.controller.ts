import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CartaoCallbackService } from './cartao-callback.service';
import { CartaoHistoricoService } from './cartao-historico.service';
import { CartaoCallbackDtoInput } from './dtos/cartao-callback.dto.input';
import { CriarHistoricoCartaoDtoInput } from './dtos/criar-historico-cartao.dto.input';
import { TemplateProvisionService } from './template-provision.service';

@ApiTags('cartao-resposta')
@Controller('v1/cartao-resposta')
export class CartaoRespostaController {
  constructor(
    private readonly provision: TemplateProvisionService,
    private readonly cartaoHistorico: CartaoHistoricoService,
    private readonly cartaoCallback: CartaoCallbackService,
  ) {}

  @Get(':simuladoId')
  @Header('Content-Type', 'application/pdf')
  async getCartao(
    @Param('simuladoId') simuladoId: string,
  ): Promise<StreamableFile> {
    const pdf = await this.provision.obterPdf(simuladoId);
    return new StreamableFile(pdf);
  }

  @Post('historico')
  async criarHistorico(@Body() dto: CriarHistoricoCartaoDtoInput) {
    return this.cartaoHistorico.criar(dto);
  }

  @Post('callback')
  @HttpCode(200)
  async callback(
    @Body() dto: CartaoCallbackDtoInput,
  ): Promise<{ status: string }> {
    await this.cartaoCallback.processar(dto);
    return { status: 'ok' };
  }
}
