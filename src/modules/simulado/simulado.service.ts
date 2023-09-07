import { Injectable } from '@nestjs/common';
import { SimuladoRepository } from './simulado.repository';
import { QuestaoService } from '../questao/questao.service';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { getDateNow } from 'src/utils/date';
import { TipoSimuladoRepository } from '../tipo-simulado/tipo-simulado.repository';
import { Simulado } from './simulado.schema';
import { EnemArea } from '../questao/enums/enem-area.enum';
import { toPascalCaseSemAcentos } from 'src/utils/string';
import { SimuladoAnswerDTOOutput } from './dtos/simulado-answer.dto.output';
import { Caderno } from '../questao/enums/caderno.enum';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly repository: SimuladoRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly questaoService: QuestaoService,
  ) {}

  public async add(idTipo: string): Promise<Simulado> {
    const oldSimulado = await this.repository.getByFilter({
      tipo: idTipo,
      bloqueado: false,
    });
    if (!!oldSimulado) {
      oldSimulado.bloqueado = true;
      oldSimulado.save();
    }
    const tipo = await this.tipoSimuladoRepository.getById(idTipo);
    const questoes = await this.questaoService.GetManyByRules(
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
    const tipoDefaults: string[] = Object.keys(EnemArea);
    const result: { [key: string]: string } = {};
    await Promise.all(
      tipoDefaults.map(async (tipoNome) => {
        const tipo = await this.tipoSimuladoRepository.getByFilter({
          nome: new RegExp(tipoNome, 'i'),
        });
        /* .select('_id'); */
        const simulado = await this.repository.getByFilter({
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

  private async GetNewSimulado(id: string) {
    const inicio = new Date(new Date().getTime() + 5);
    const simulado = await this.GetSimuladoById(id, inicio);
    return simulado;
  }

  private async GetSimuladoById(
    id: string,
    inicio: Date,
  ): Promise<SimuladoAnswerDTOOutput> {
    const simulado = await this.repository.getById(id, false);
    return !simulado
      ? null
      : {
          _id: simulado._id,
          nome: simulado.nome,
          descricao: simulado.descricao,
          tipo: simulado.tipo._id,
          questoes: simulado.questoes.map((q) => ({
            _id: q._id,
            exame: q.exame,
            ano: q.ano,
            caderno: q.caderno as unknown as Caderno,
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
}
