import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RelatorioSimuladoEstudante } from './relatorio-simulado-estudante.schema';

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
}
