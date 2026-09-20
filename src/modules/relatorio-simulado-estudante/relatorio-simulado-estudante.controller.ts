import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { ConsultarRelatorioDtoBody } from './dtos/consultar-relatorio.dto.body';
import { ConsultarRelatorioDtoInput } from './dtos/consultar-relatorio.dto.input';
import { DetalheDoEstudanteDtoOutput } from './dtos/detalhe-do-estudante.dto.output';
import { QuestoesDoRelatorioDtoOutput } from './dtos/questoes-do-relatorio.dto.output';
import { RelatorioSimuladoDtoOutput } from './dtos/relatorio-simulado.dto.output';
import { SimuladosComCartaoDtoOutput } from './dtos/simulados-com-cartao.dto.output';
import { RelatorioSimuladoEstudanteService } from './relatorio-simulado-estudante.service';

@ApiTags('Relatório de Simulado')
@Controller('v1/relatorio-simulado')
export class RelatorioSimuladoEstudanteController {
  constructor(private readonly service: RelatorioSimuladoEstudanteService) {}

  /**
   * ⚠️ **PRIMEIRA rota da classe, e isso não é estilo.** `simulados` tem a
   * mesma contagem de segmentos que `:simuladoId`; declarada depois, o param
   * a captura, `Types.ObjectId.isValid('simulados')` recusa, e a rota
   * responde 400. Nenhum teste de unidade pega — só um que suba o app.
   */
  /**
   * ⚠️ **POST para CONSULTA, e por um motivo só: o corpo.** A lista de
   * usuários do recorte não cabe numa query string — um UUID ocupa 36
   * caracteres e uma turma de 50 já passa de 2.300, acima do limite seguro de
   * URL. Rota interna (o ms não é público), então o método importa menos que
   * o recorte estar certo.
   *
   * ⚠️ **As rotas GET continuam existindo**, e isso não é indecisão: durante o
   * deploy a api ainda chama as antigas, e removê-las agora derrubaria o
   * relatório na janela entre subir o ms e subir a api. Elas saem num card
   * próprio, depois que os logs mostrarem que ninguém mais as chama.
   *
   * ⚠️ **Declarada antes de `@Post(':simuladoId')`** pelo mesmo motivo que a
   * `@Get('simulados')`: mesma contagem de segmentos, e o param captura.
   */
  @Post('simulados')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description:
      'simulados com cartão no recorte (cursinho ou lista de usuários)',
    type: SimuladosComCartaoDtoOutput,
  })
  async listarSimuladosPorRecorte(
    @Body() body: ConsultarRelatorioDtoBody,
  ): Promise<SimuladosComCartaoDtoOutput> {
    return this.service.listarSimulados({
      cursinhoId: body.cursinhoId,
      usuarios: body.usuarios,
    });
  }

  @Post(':simuladoId/questoes')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'agregado por questão no recorte',
    type: QuestoesDoRelatorioDtoOutput,
  })
  async consultarQuestoesPorRecorte(
    @Param('simuladoId') simuladoId: string,
    @Body() body: ConsultarRelatorioDtoBody,
  ): Promise<QuestoesDoRelatorioDtoOutput> {
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultarQuestoes({
      simuladoId,
      cursinhoId: body.cursinhoId,
      usuarios: body.usuarios,
    });
  }

  @Post(':simuladoId')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'linhas do simulado no recorte',
    type: RelatorioSimuladoDtoOutput,
  })
  async consultarPorRecorte(
    @Param('simuladoId') simuladoId: string,
    @Body() body: ConsultarRelatorioDtoBody,
  ): Promise<RelatorioSimuladoDtoOutput> {
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultar({
      simuladoId,
      cursinhoId: body.cursinhoId,
      usuarios: body.usuarios,
    });
  }

  @Get('simulados')
  @ApiResponse({
    status: 200,
    description: 'simulados com cartão no recorte do cursinho (ou da turma)',
    type: SimuladosComCartaoDtoOutput,
  })
  async listarSimulados(
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<SimuladosComCartaoDtoOutput> {
    return this.service.listarSimulados({
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }

  @Get(':simuladoId/questoes')
  @ApiResponse({
    status: 200,
    description: 'agregado por questão no recorte do cursinho (ou da turma)',
    type: QuestoesDoRelatorioDtoOutput,
  })
  async consultarQuestoes(
    @Param('simuladoId') simuladoId: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<QuestoesDoRelatorioDtoOutput> {
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultarQuestoes({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }

  @Get(':simuladoId/estudante/:usuario')
  @ApiResponse({
    status: 200,
    description: 'o que o estudante marcou e o que era correto',
    type: DetalheDoEstudanteDtoOutput,
  })
  @ApiResponse({
    status: 404,
    description:
      'estudante não tem cartão neste simulado, ou é de outro cursinho',
  })
  async consultarDetalhe(
    @Param('simuladoId') simuladoId: string,
    @Param('usuario') usuario: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<DetalheDoEstudanteDtoOutput> {
    // Sem isto, `new Types.ObjectId(simuladoId)` lança BSONError e vira 500 —
    // erro do CHAMADOR virando 500 sem pista, como nas rotas vizinhas.
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultarDetalhe({
      simuladoId,
      usuario,
      cursinhoId: query.cursinhoId,
    });
  }

  @Get(':simuladoId')
  @ApiResponse({
    status: 200,
    description: 'linhas do simulado no recorte do cursinho (ou da turma)',
    type: RelatorioSimuladoDtoOutput,
  })
  async consultar(
    @Param('simuladoId') simuladoId: string,
    @Query() query: ConsultarRelatorioDtoInput,
  ): Promise<RelatorioSimuladoDtoOutput> {
    // Sem isto, `new Types.ObjectId(simuladoId)` no repositório lança
    // `BSONError` para qualquer coisa que não seja 24 hex — e vira 500. Um
    // typo de :simuladoId numa rota proxied pela api é erro do CHAMADOR, não
    // do ms — tem que ser 400, não um 500 sem pista nos logs de um serviço
    // que o time da api não é dono.
    if (!Types.ObjectId.isValid(simuladoId)) {
      throw new BadRequestException(`simuladoId inválido: ${simuladoId}`);
    }

    return this.service.consultar({
      simuladoId,
      cursinhoId: query.cursinhoId,
      turmaId: query.turmaId,
    });
  }
}
