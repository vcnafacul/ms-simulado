import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Questao } from 'src/models/questao.model';
import { IServiceBase } from 'src/services/contracts/service-base.contracts';
import { TipoSimulado } from 'src/models/tipo-simulado.model';
import { Regra } from 'src/models/regra.model';
import { QuestaoInputDto } from 'src/dtos/questao-input.dto';

@Injectable()
export class QuestaoService implements IServiceBase<Questao, QuestaoInputDto> {
  constructor(@InjectModel('Questao') private readonly model: Model<Questao>) {}

  public async Add(item: QuestaoInputDto): Promise<Questao> {
    const questao = new this.model(item);
    return await questao.save();
  }

  public async GetAll(): Promise<Questao[]> {
    return await this.model
      .find({}, 'exame frente1 frente2 frente3 materia')
      .sort('materia')
      .exec();
  }

  public async GetById(idQuestao: string): Promise<Questao | null> {
    return await this.model
      .findById({ idQuestao })
      .populate(['exame', 'frente1', 'frente2', 'frente3', 'materia'])
      .exec();
  }

  public async Delete(idQuestao: string): Promise<boolean> {
    const remove = await this.model.deleteOne({ _id: idQuestao });
    return remove.deletedCount > 0;
  }

  public async GetManyByRules(tipo: TipoSimulado): Promise<Questao[] | null> {
    let questoes: any[] = [];
    if (tipo) {
      await Promise.all(
        tipo.regras.map(async (regra) => {
          const q = await this.GetQuestionByRule(regra);
          questoes = questoes.concat(q);
        }),
      );
    } else {
      throw Error(
        `Erro ao Buscar Tipo de Simulado. Verifique que o mesmo existe`,
      );
    }

    if (
      questoes.length == 0 ||
      tipo!.quantidadeTotalQuestao > questoes.length
    ) {
      throw Error(
        `Não foi possível buscar o numero de questoes determinadas. ` +
          `Questoes Selecionada: ${questoes.length} - ` +
          `Questoes Totais Requeridas: ${tipo.quantidadeTotalQuestao}`,
      );
    }
    questoes.forEach(async (questao) => {
      await this.incrementQuantidadeSimulado(questao._id);
    });
    return questoes;
  }

  private async GetQuestionByRule(regra: Regra) {
    const regras: { [key: string]: any } = {};
    regras['materia'] = regra.materia._id.toString();
    if (regra.frente) regras['frente1'] = regra.frente._id.toString();
    if (regra.ano) regras['ano'] = regra.ano;
    if (regra.caderno) regras['ano'] = regra.caderno;
    const questions = await this.model
      .find(regras)
      .exists('imageId', true)
      .select('_id')
      .sort({ quantidadeSimulado: 1 })
      .limit(regra.quantidade as number);
    return questions;
  }

  private async incrementQuantidadeSimulado(questaoId: string) {
    await this.model.findByIdAndUpdate(questaoId, {
      $inc: { quantidadeSimulado: 1 },
    });
  }
}
