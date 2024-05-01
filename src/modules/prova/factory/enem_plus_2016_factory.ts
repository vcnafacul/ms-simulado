import { HttpException, HttpStatus } from '@nestjs/common';
import { Exame } from 'src/modules/exame/exame.schema';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { SimuladoRepository } from 'src/modules/simulado/repository/simulado.repository';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';
import { IProvaFactory } from './types';

export class EnemPlus2016Factory implements IProvaFactory {
  constructor(
    private readonly provarepository: ProvaRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly simuladoRepository: SimuladoRepository,
    private exame: Exame,
  ) {}

  async createProva(item: CreateProvaDTOInput): Promise<Prova> {
    const tipo = await this.tipoSimuladoRepository.getById(item.tipo);
    const prova = new Prova(item, this.exame, tipo);
    prova.nome = `${tipo.nome} ${prova.ano} ${prova.edicao} ${prova.aplicacao}`;
    const hasProva = await this.getByName(prova.nome);
    if (!!hasProva) {
      throw new HttpException('Prova já esta cadastrada', HttpStatus.CONFLICT);
    }
    return prova;
  }

  public async createSimulados(prova: Prova) {
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    if (prova.tipo.nome === EnemArea.Enem1) {
      prova.simulado.push(
        await this.createSimuladoArea(mainName, EnemArea.Linguagens),
      );
      prova.simulado.push(
        await this.createSimuladoArea(mainName, EnemArea.CienciasHumanas),
      );
    } else if (prova.tipo.nome === EnemArea.Enem2) {
      prova.simulado.push(
        await this.createSimuladoArea(mainName, EnemArea.BioExatas),
      );
      prova.simulado.push(
        await this.createSimuladoArea(mainName, EnemArea.Matematica),
      );
    }
    prova.simulado.push(
      await this.simuladoRepository.create({
        nome: mainName,
        tipo: prova.tipo,
        questoes: [],
        descricao: prova.exame.nome,
      }),
    );
  }

  private async createSimuladoArea(defaultName: string, nomeTipo: string) {
    const simuladoArea = new Simulado();
    const tipo = await this.tipoSimuladoRepository.getByFilter({
      nome: nomeTipo,
    });
    simuladoArea.tipo = tipo;
    simuladoArea.nome = `${defaultName} ${nomeTipo}`;
    return await this.simuladoRepository.create(simuladoArea);
  }

  public async getByName(nome: string): Promise<Prova> {
    return await this.provarepository.getByFilter({ nome });
  }
}
