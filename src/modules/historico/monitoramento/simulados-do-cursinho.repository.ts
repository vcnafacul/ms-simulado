import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { Historico } from '../historico.schema';

/**
 * Os simulados de um cursinho (tickets/044, D2): `Simulado.cursinhoId`, que nasce
 * com as provas do cursinho (026). Simulado da plataforma (`cursinhoId: null`)
 * nunca entra.
 */
@Injectable()
export class SimuladosDoCursinhoRepository {
  constructor(
    @InjectModel(Simulado.name) private readonly model: Model<Simulado>,
  ) {}

  async ids(cursinhoId: string): Promise<Types.ObjectId[]> {
    const docs = await this.model
      .find({ cursinhoId }, { _id: 1 })
      .lean<{ _id: Types.ObjectId }[]>();
    return docs.map((d) => d._id);
  }

  /**
   * O filtro de histórico pelos simulados do cursinho.
   *
   * ⚠️ `Historico.simulado` é `type: Types.ObjectId`, que o Mongoose trata como
   * Mixed: há documentos com o id em texto. O `$in` leva os dois formatos.
   */
  async filtroDeHistorico(cursinhoId: string): Promise<FilterQuery<Historico>> {
    const ids = await this.ids(cursinhoId);
    return { simulado: { $in: [...ids, ...ids.map((id) => id.toString())] } };
  }
}
