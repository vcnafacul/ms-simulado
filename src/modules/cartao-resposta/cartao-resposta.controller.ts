import {
  BadRequestException,
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
import { Types } from 'mongoose';
import { CartaoCallbackService } from './cartao-callback.service';
import { CartaoHistoricoService } from './cartao-historico.service';
import { CartaoImagemService } from './cartao-imagem.service';
import { CartaoReprocessoService } from './cartao-reprocesso.service';
import { CartaoCallbackDtoInput } from './dtos/cartao-callback.dto.input';
import { CriarHistoricoCartaoDtoInput } from './dtos/criar-historico-cartao.dto.input';
import { LocalizarImagemCartaoDtoInput } from './dtos/localizar-imagem-cartao.dto.input';
import { ReprocessarCartaoDtoInput } from './dtos/reprocessar-cartao.dto.input';
import { TemplateProvisionService } from './template-provision.service';

@ApiTags('cartao-resposta')
@Controller('v1/cartao-resposta')
export class CartaoRespostaController {
  constructor(
    private readonly provision: TemplateProvisionService,
    private readonly cartaoHistorico: CartaoHistoricoService,
    private readonly cartaoCallback: CartaoCallbackService,
    private readonly cartaoReprocesso: CartaoReprocessoService,
    private readonly cartaoImagem: CartaoImagemService,
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

  /**
   * ⚠️ Tudo menos o `historicoId` vem no CORPO — o `cursinhoId` em especial.
   * Um path param cru já deixou o chamador reescrever a URL que a api manda
   * ao ms, e um `?` embutido sobrepunha o cursinho resolvido do JWT.
   *
   * 202: o OMR é acionado aqui, mas a leitura só volta pelo callback.
   */
  @Post(':historicoId/reprocessar')
  @HttpCode(202)
  async reprocessar(
    @Param('historicoId') historicoId: string,
    @Body() dto: ReprocessarCartaoDtoInput,
  ): Promise<{ status: string }> {
    // ⚠️ Sem isto, `new Types.ObjectId(historicoId)` no repositório lança
    // `BSONError` e a rota responde **500**: erro do CHAMADOR virando falha de
    // um serviço que o time da api não é dono, sem pista nos logs. O controller
    // do relatório guarda o `:simuladoId` pelo mesmo motivo.
    if (!Types.ObjectId.isValid(historicoId)) {
      throw new BadRequestException(`historicoId inválido: ${historicoId}`);
    }

    await this.cartaoReprocesso.reprocessar({
      historicoId,
      cursinhoId: dto.cursinhoId,
      imageKey: dto.imageKey,
      simuladoId: dto.simuladoId,
      cartaoCode: dto.cartaoCode,
      // O relógio entra pela borda: o serviço é puro quanto a tempo, e o rate
      // limit fica testável sem fake timers.
      agora: new Date(),
    });
    return { status: 'aceito' };
  }

  /**
   * Onde está a foto do cartão, para a api baixar do bucket.
   *
   * ⚠️ **POST, com o `cursinhoId` no corpo** — o mesmo contrato do
   * `reprocessar`, pelo mesmo motivo. 200 explícito: não cria nada.
   */
  @Post(':historicoId/imagem')
  @HttpCode(200)
  async localizarImagem(
    @Param('historicoId') historicoId: string,
    @Body() dto: LocalizarImagemCartaoDtoInput,
  ): Promise<{ imageKey: string }> {
    if (!Types.ObjectId.isValid(historicoId)) {
      throw new BadRequestException(`historicoId inválido: ${historicoId}`);
    }
    return this.cartaoImagem.localizar(historicoId, dto.cursinhoId);
  }
}
