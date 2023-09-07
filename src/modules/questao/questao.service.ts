import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { QuestaoRepository } from './questao.repository';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { Questao } from './questao.schema';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { Regra } from '../tipo-simulado/schemas/regra.schemas';

@Injectable()
export class QuestaoService {
  constructor(private readonly repository: QuestaoRepository) {}

  public async add(item: CreateQuestaoDTOInput): Promise<Questao> {
    const questao = Object.assign(new Questao(), item);

    return await this.repository.create(questao);
  }

  public async getById(id: string): Promise<Questao> {
    const questao = await this.repository.getById(id);
    return questao;
  }

  public async getAll(): Promise<Questao[]> {
    const questoes = await this.repository.getAll();
    return questoes;
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async GetManyByRules(tipo: TipoSimulado): Promise<Questao[]> {
    let questoes: Questao[] = [];
    if (tipo) {
      await Promise.all(
        tipo.regras.map(async (regra) => {
          questoes = questoes.concat(await this.GetQuestaoByRegras(regra));
        }),
      );
    } else {
      throw new HttpException(
        `Erro ao Buscar Tipo de Simulado. Verifique que o mesmo existe`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      questoes.length == 0 ||
      tipo!.quantidadeTotalQuestao > questoes.length
    ) {
      throw new HttpException(
        `Não foi possível buscar o numero de questoes determinadas. ` +
          `Questoes Selecionada: ${questoes.length} - ` +
          `Questoes Totais Requeridas: ${tipo.quantidadeTotalQuestao}`,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.repository.IncrementaSimulado(questoes.map((q) => q._id));
    return questoes;
  }

  private async GetQuestaoByRegras(regra: Regra) {
    const regras = this.MontaFiltro(regra);
    return await this.repository.getQuestaoByFiltro(
      regras,
      regra.quantidade as number,
    );
  }

  private MontaFiltro(regra: Regra) {
    const regras: { [key: string]: any } = {};
    regras['materia'] = regra.materia._id;
    if (regra.frente) regras['frente1'] = regra.frente._id;
    if (regra.ano) regras['ano'] = regra.ano;
    if (regra.caderno) regras['ano'] = regra.caderno;
    return regras;
  }
}
