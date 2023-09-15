import { Model } from "mongoose"
import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Relatorio } from "src/models/relatorio.model"
import { RelatorioSimuladoDto } from "src/dtos/relatorio-simulado.dto"

@Injectable()
export class RelatorioService{
  constructor(
    @InjectModel('Relatorio') private readonly model: Model<Relatorio>,
  ) { }

  public async Add(item: RelatorioSimuladoDto): Promise<Relatorio> {
      const relatorio = new this.model(item);
      return relatorio.save();
  }

  public async GetAll(): Promise<Relatorio[]> {
      return await this.model
      .find({})
      .sort('simulado')
      .exec();
  }

  public async GetById(id: string): Promise<Relatorio | null> {
    return await this.model.findById(id)
      .populate(['respostas'])
      .populate({ path: 'respostas',
        populate: {
          path: 'questao', 
          model: 'Questao',
          select: ['+alternativa']
        },
        })
  }
}
