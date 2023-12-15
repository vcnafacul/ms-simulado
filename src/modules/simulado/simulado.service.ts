import { Injectable } from '@nestjs/common';
import { SimuladoRepository } from './repository/simulado.repository';
import { QuestaoService } from '../questao/questao.service';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { getDateNow } from 'src/utils/date';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { Simulado } from './schemas/simulado.schema';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { toPascalCaseSemAcentos } from 'src/utils/string';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { CreateSimuladoDTOInput } from './dtos/create.dto.input';
import { AnswerSimulado } from './dtos/answer-simulado.dto.input';
import { RespostaRepository } from './repository/resposta.repository';
import { RespostaSimulado } from './schemas/resposta-simulado.schema';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly repository: SimuladoRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly respostaRepository: RespostaRepository,
    private readonly questaoService: QuestaoService,
  ) {}

  public async add(dto: CreateSimuladoDTOInput): Promise<Simulado> {
    const oldSimulado = await this.repository.getByFilter({
      tipo: dto.tipoId,
      bloqueado: false,
    });
    if (!!oldSimulado) {
      oldSimulado.bloqueado = true;
      oldSimulado.save();
    }
    const tipo = await this.tipoSimuladoRepository.getById(dto.tipoId);
    const questoes = await this.questaoService.GeyManyQuestao(
      tipo as TipoSimulado,
    );
    const simulado = await this.repository.create({
      nome: `${tipo?.nome} ${getDateNow()}`,
      descricao: `Simulado de ${tipo?.nome}`,
      tipo: tipo,
      questoes: questoes,
    });
    return simulado;
  }

  public async getDefaults() {
    const tipoDefaults: string[] = Object.values(EnemArea);
    const result: { [key: string]: string } = {};
    await Promise.all(
      tipoDefaults.map(async (tipoNome) => {
        const tipo = await this.tipoSimuladoRepository.getByFilter({
          nome: new RegExp(tipoNome, 'i'),
        });
        if (tipo) {
          const simulado = await this.repository.getByFilter({
            tipo: tipo._id || '',
            bloqueado: false,
          });
          if (simulado) {
            const key = toPascalCaseSemAcentos(
              simulado?.descricao.replace('Simulado de', ''),
            );
            result[key] = simulado._id;
          }
        }
      }),
    );
    return result;
  }

  public async getById(id: string): Promise<Simulado | null> {
    return await this.repository.getById(id);
  }

  public async getAll(): Promise<Simulado[]> {
    return await this.repository.getAll();
  }

  public async delete(id: string) {
    await this.repository.delete(id);
  }

  public async getToAnswer(
    simuladoId: string,
  ): Promise<SimuladoAnswerDTOOutput> {
    try {
      return await this.GetNewSimulado(simuladoId);
    } catch (error) {
      return null;
    }
  }

  public async answer(answer: AnswerSimulado) {
    const simulado = await this.repository.answer(answer.idSimulado);

    const respostas = simulado?.questoes.map((questao) => {
      const resposta = answer.respostas.find(
        (r) => r.questao === questao._id.toString(),
      );
      return {
        questao: questao._id.toString(),
        alternativaEstudante: resposta?.alternativaEstudante,
        alternativaCorreta: questao.alternativa,
      };
    });
    const respostaSimulado: RespostaSimulado = {
      idEstudante: answer.idEstudante,
      idSimulado: answer.idSimulado,
      respostas: respostas,
    };
    await this.respostaRepository.create(respostaSimulado);
  }

  private async GetNewSimulado(id: string) {
    const inicio = new Date(new Date().getTime() + 5);
    const simulado = await this.GetSimuladoById(id, inicio);
    return simulado;
  }

  private async GetSimuladoById(
    id: string,
    inicio: Date,
  ): Promise<SimuladoAnswerDTOOutput> {
    const simulado = await this.repository.getById(id);
    return !simulado
      ? null
      : {
          _id: simulado._id,
          nome: simulado.nome,
          descricao: simulado.descricao,
          tipo: simulado.tipo._id,
          questoes: simulado.questoes.map((q) => ({
            _id: q._id,
            enemArea: q.enemArea,
            frente1: q.frente1,
            frente2: q.frente2,
            frente3: q.frente3,
            materia: q.materia,
            numero: q.numero,
            imageId: q.imageId,
            prova: q.prova,
          })),
          inicio: inicio,
          duracao: simulado.tipo.duracao,
        };
  }
}
