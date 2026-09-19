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
   * Só a escrita. As consultas do relatório são do card 02 — criá-las aqui
   * seria adivinhar a forma delas antes de a tela existir.
   */
  async criar(data: {
    historicoId: string;
    simuladoId: string;
    usuario: string;
    cursinhoId: string;
    turmaId?: string;
  }): Promise<void> {
    await this.model.create({
      historico: new Types.ObjectId(data.historicoId),
      simulado: new Types.ObjectId(data.simuladoId),
      usuario: data.usuario,
      cursinhoId: data.cursinhoId,
      turmaId: data.turmaId,
    });
  }
}
