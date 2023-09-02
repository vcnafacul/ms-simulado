import { TipoSimuladoDto } from "src/dtos/tipo-simulado.dto"
import { IServiceBase } from "./contracts/service-base.contracts"
import { TipoSimulado } from "src/models/tipo-simulado.model"
import { Injectable } from "@nestjs/common"
import { Model } from "mongoose"
import { InjectModel } from "@nestjs/mongoose"

@Injectable()
export class TipoSimuladoService implements IServiceBase<TipoSimulado, TipoSimuladoDto> {
  constructor(
    @InjectModel('TipoSimulado') private readonly tipoSimuladoModel: Model<TipoSimulado>,
  ) { }

  public async Add (tipoSimulado: TipoSimuladoDto): Promise<TipoSimulado> {
    const tipoS = await this.tipoSimuladoModel.create({
      nome: tipoSimulado.nome,
      quantidadeTotalQuestao: tipoSimulado.quantidadeTotalQuestao,
      regras: tipoSimulado.regras != null ? tipoSimulado.regras : [],
      duracao: tipoSimulado.duracao
    })

    return tipoS
  }

  public async GetAll (): Promise<TipoSimulado[]> {
    return await this.tipoSimuladoModel.find()
  }

  public async GetById (id: string): Promise<TipoSimulado | null> {
    return await this.tipoSimuladoModel
      .findById(id)
      .populate({
        path: 'regras',
        populate: {
          path: 'materia', model: 'Materia'
        }
      })
      .populate({
        path: 'regras',
        populate: {
          path: 'frente', model: 'Frente'
        }
      })
  }

  public async Delete (id: string): Promise<boolean> {
    const remove = await this.tipoSimuladoModel.deleteOne({ _id: id })
    return remove.deletedCount > 0
  }
}
