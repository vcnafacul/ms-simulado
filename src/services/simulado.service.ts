import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Simulado } from 'src/models/simulado.model';
import { getDateNow } from 'src/utils/date';
import { toPascalCaseSemAcentos } from 'src/utils/string';
import { RespostaRelatorio } from 'src/models/resposta-relatorio.model';
import { SimuladoDto } from 'src/dtos/simulado.dto';
import { RespostaSimuladoDto } from 'src/dtos/reposta-simulado.dto';
import { Relatorio } from 'src/models/relatorio.model';
import { RelatorioSimuladoDto } from 'src/dtos/relatorio-simulado.dto';
import { RelatorioService } from './relatorio.service';

@Injectable()
export class SimuladoService {
  constructor(
    @InjectModel('Simulado') private readonly simuladoModel: Model<Simulado>,
    @InjectModel('TipoSimulado')
    private readonly tipoSimuladoModel: Model<TipoSimulado>,
    private readonly questaoService: QuestaoService,
    private readonly relatorioService: RelatorioService,
  ) {}

  public async Create(idTipo: string): Promise<number | null> {
    try {
      const oldSimulado = await this.simuladoModel.findOne({
        tipo: idTipo,
        bloqueado: false,
      });
      if (!!oldSimulado) {
        oldSimulado.bloqueado = true;
        oldSimulado.save();
      }
      const tipo = await this.tipoSimuladoModel.findById(idTipo);
      const questoes = await this.questaoService.GetManyByRules(
        tipo as TipoSimulado,
      );
      const simulado = await this.simuladoModel.create({
        nome: `${tipo?.nome} ${getDateNow()}`,
        descricao: `Simulado de ${tipo?.nome}`,
        tipo: tipo,
        questoes: questoes,
      });
      return simulado.id;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }

  public async GetDefaults() {
    const tipoDefaults: string[] = Object.keys(EnemArea);
    const result: { [key: string]: string } = {};
    await Promise.all(
      tipoDefaults.map(async (tipoNome) => {
        const tipo = await this.tipoSimuladoModel
          .findOne({ nome: new RegExp(tipoNome, 'i') })
          .select('_id');
        const simulado = await this.simuladoModel.findOne({
          tipo: tipo._id.toString() || '',
          bloqueado: false,
        });

        if (simulado) {
          const key = toPascalCaseSemAcentos(
            simulado?.descricao.replace('Simulado de', ''),
          );
          result[key] = simulado._id;
        }
      }),
    );
    return result;
  }

  public async GetById(id: string): Promise<Simulado | null> {
    return await this.simuladoModel
      .findById(id)
      .populate(['tipo', 'questoes'])
      .populate({
        path: 'questoes',
        populate: ['frente1', 'frente2', 'frente3', 'materia'],
      });
  }

  public async GetAll(): Promise<Simulado[]> {
    return await this.simuladoModel.find();
  }

  public async GetAllAtivos(): Promise<Simulado[]> {
    return await this.simuladoModel.find({ bloqueado: false });
  }

  public async Delete(id: string): Promise<boolean> {
    const update = await this.simuladoModel.updateOne(
      { _id: id },
      { $set: { bloqueado: true } },
    );
    return update.modifiedCount > 0;
  }

  public async GetToAnswer(
    simuladoId: string,
    userId: number,
  ): Promise<SimuladoDto | null> {
    try {
      return await this.GetNewSimulado(simuladoId, userId);
    } catch (error) {
      return null;
    }
  }

  public async ReceiveAnswers(
    resposta: RespostaSimuladoDto,
  ): Promise<Relatorio> {
    const simulado = await this.simuladoModel
      .findById(resposta.Idsimulado)
      .populate({
        path: 'questoes',
        select: 'alternativa',
      });

    const resRel = simulado?.questoes.map((q) => {
      const res = resposta.respostas.find(
        (r) => r.idQuestao === q._id.toString(),
      );
      return {
        questao: q._id,
        respostaEstudante: res!.alternativaEstudante,
        alternativaCorreta: q.alternativa,
      };
    }) as unknown as RespostaRelatorio[];

    const performance = await this.SimulatePerformance(resRel);

    const relatorioSimulado: RelatorioSimuladoDto = {
      estudante: resposta.Idestudante,
      simulado: simulado,
      respostas: resRel,
      aproveitamento: performance,
    };

    return await this.relatorioService.Add(relatorioSimulado);
  }

  public async SimuladoDefault() {}

  private async GetNewSimulado(id: string, userId: number) {
    const inicio = new Date(new Date().getTime() + 5);
    console.log(inicio);
    const simulado = await this.GetSimuladoById(id, inicio);
    console.log(simulado);
    return simulado;
  }

  private async GetSimuladoById(
    id: string,
    inicio: Date,
  ): Promise<SimuladoDto | null> {
    const simulado = await this.simuladoModel
      .findOne({ _id: id, bloqueado: false })
      .populate(['tipo', 'questoes'])
      .populate({
        path: 'questoes',
        populate: ['frente1', 'frente2', 'frente3', 'materia'],
      });
    return !simulado
      ? null
      : {
          id: simulado.id,
          nome: simulado.nome,
          descricao: simulado.descricao,
          tipo: simulado.tipo.id,
          questoes: simulado.questoes.map((q) => ({
            _id: q._id,
            exame: q.exame,
            ano: q.ano,
            caderno: q.caderno,
            enemArea: q.enemArea,
            frente1: q.frente1,
            frente2: q.frente2,
            frente3: q.frente3,
            materia: q.materia,
            numero: q.numero,
            imageId: q.imageId,
          })),
          inicio: inicio,
          duracao: simulado.tipo.duracao,
        };
  }

  private async SimulatePerformance(
    respostas: RespostaRelatorio[],
  ): Promise<number> {
    const acertos = respostas.filter(
      (res) => res.respostaEstudante === res.alternativaCorreta,
    ).length;
    return acertos / respostas.length;
  }
}
