import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { QuestaoRepository } from './questao.repository';
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { Questao } from './questao.schema';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { Regra } from '../tipo-simulado/schemas/regra.schemas';
import { ReportDTO } from './dtos/report.dto.input';
import { Status } from './enums/status.enum';
import { ExameRepository } from '../exame/exame.repository';
import { MateriaRepository } from '../materia/materia.repository';
import { FrenteRepository } from '../frente/frente.repository';

@Injectable()
export class QuestaoService {
  constructor(
    private readonly repository: QuestaoRepository,
    private readonly exameRepository: ExameRepository,
    private readonly materiaRepository: MateriaRepository,
    private readonly frenteRepository: FrenteRepository,
  ) {}

  public async add(item: CreateQuestaoDTOInput): Promise<Questao> {
    const questao = Object.assign(new Questao(), item);

    return await this.repository.create(questao);
  }

  public async getById(id: string): Promise<Questao> {
    const questao = await this.repository.getById(id);
    return questao;
  }

  public async getAll(status?: Status): Promise<Questao[]> {
    const questoes = await this.repository.getAll(status);
    return questoes;
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async GeyManyQuestao(tipo: TipoSimulado): Promise<Questao[]> {
    let questoes: Questao[] = [];
    await Promise.all(
      tipo.regras.map(async (regra) => {
        questoes = questoes.concat(await this.getQuestaoByRegras(regra));
      }),
    );

    if (tipo.quantidadeTotalQuestao > questoes.length) {
      questoes = questoes.concat(
        await this.getQuestoes(tipo.quantidadeTotalQuestao - questoes.length),
      );
    }
    await this.repository.IncrementaSimulado(questoes.map((q) => q._id));
    return questoes;
  }

  public async report(reportDTO: ReportDTO) {
    console.log(reportDTO);
  }

  public async getInfos() {
    const exames = await this.exameRepository.getAll();
    const materias = await this.materiaRepository.getAll();
    const frentes = await this.frenteRepository.getAll();
    return { exames, materias, frentes };
  }

  private async getQuestaoByRegras(regra: Regra) {
    const regras = this.MontaFiltro(regra);
    return await this.getQuestoesByFiltro(regras, regra.quantidade as number);
  }

  private async getQuestoes(amount: number) {
    return await this.getQuestoesByFiltro({}, amount);
  }

  private async getQuestoesByFiltro(
    regras: { [key: string]: any },
    amount: number,
  ) {
    const questoes = await this.repository.getQuestaoByFiltro(regras, amount);
    if (questoes.length != amount) {
      throw new HttpException(
        `Não foi possível buscar o numero de questoes determinadas. ` +
          `Questoes Selecionada: ${questoes.length} - ` +
          `Questoes Totais Requeridas: ${amount}`,
        HttpStatus.NOT_FOUND,
      );
    }
    return questoes;
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
