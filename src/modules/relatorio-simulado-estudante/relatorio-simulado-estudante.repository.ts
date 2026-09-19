import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Historico } from '../historico/historico.schema';
import { RelatorioSimuladoEstudante } from './relatorio-simulado-estudante.schema';

/**
 * Só o que as telas dos cards 04–07 usam. `respostas` fica de fora de propósito:
 * 90 questões × centenas de estudantes é carga que nenhuma delas lê. O card 07
 * busca o histórico por id quando precisar do detalhe.
 */
const CAMPOS_DO_HISTORICO =
  'status cartaoCode questoesRespondidas aproveitamento.geral falha';

/**
 * `historico` é `| null` porque o `populate` de uma ref apagada (`Historico`
 * removido depois do vínculo) devolve `null`, não lança — quem consome isto
 * (a service) precisa tratar a ausência, não presumir a ref viva.
 */
export type LinhaComHistorico = RelatorioSimuladoEstudante & {
  historico: Historico | null;
};

@Injectable()
export class RelatorioSimuladoEstudanteRepository {
  constructor(
    @InjectModel(RelatorioSimuladoEstudante.name)
    private readonly model: Model<RelatorioSimuladoEstudante>,
  ) {}

  /**
   * Uma linha por estudante por simulado por cursinho, apontando para a tentativa
   * ATUAL. Reenviar depois de uma falha cria um `Historico` novo — sem o upsert,
   * nasceria uma segunda linha e o estudante apareceria duas vezes no relatório.
   *
   * Só a escrita: as consultas do relatório são de um card posterior.
   */
  async registrar(data: {
    historicoId: string;
    simuladoId: string;
    usuario: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<void> {
    await this.model.updateOne(
      {
        simulado: new Types.ObjectId(data.simuladoId),
        cursinhoId: data.cursinhoId,
        usuario: data.usuario,
      },
      {
        $set: {
          historico: new Types.ObjectId(data.historicoId),
          turmaId: data.turmaId,
        },
      },
      { upsert: true },
    );
  }

  /**
   * As linhas de um simulado dentro de um recorte. O recorte é imposto AQUI, no
   * Mongo — trazer tudo e filtrar do outro lado transporta dados de outros
   * cursinhos pela rede interna e não escala.
   */
  async buscarPorRecorte(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<LinhaComHistorico[]> {
    const filtro: Record<string, unknown> = {
      simulado: new Types.ObjectId(params.simuladoId),
      cursinhoId: params.cursinhoId,
    };
    // `{ turmaId: undefined }` vira `{ turmaId: null }` e casa SÓ quem não tem
    // turma — a visão do cursinho inteiro perderia todo mundo COM turma.
    if (params.turmaId !== undefined) {
      filtro.turmaId = params.turmaId;
    }

    return this.model
      .find(filtro)
      .sort({ usuario: 1 })
      .populate({ path: 'historico', select: CAMPOS_DO_HISTORICO })
      .lean()
      .exec() as unknown as Promise<LinhaComHistorico[]>;
  }

  /**
   * Quantos cartões deste simulado o cursinho enviou. Alimenta o rodapé do
   * relatório por turma — "27 dos 30 cartões deste simulado são desta turma".
   *
   * ⚠️ Escopado no cursinho, nunca global: um `countDocuments({ simulado })`
   * diria a um cursinho quantos cartões os outros enviaram.
   */
  async contarDoCursinho(
    simuladoId: string,
    cursinhoId: string,
  ): Promise<number> {
    return this.model.countDocuments({
      simulado: new Types.ObjectId(simuladoId),
      cursinhoId,
    });
  }
}
