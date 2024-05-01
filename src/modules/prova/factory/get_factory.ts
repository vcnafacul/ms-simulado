import { Exame } from 'src/modules/exame/exame.schema';
import { SimuladoRepository } from 'src/modules/simulado/repository/simulado.repository';
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { ProvaRepository } from '../prova.repository';
import { EnemPlus2016Factory } from './enem_plus_2016_factory';
import { ProvaFactory } from './prova_factory';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProvaFactoryImp {
  constructor(
    private readonly provarepository: ProvaRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly simuladoRepository: SimuladoRepository,
  ) {}

  public getFactory(exame: Exame, ano: number): ProvaFactory {
    if (exame.nome === 'ENEM' && ano > 2016) {
      return new EnemPlus2016Factory(
        this.provarepository,
        this.tipoSimuladoRepository,
        this.simuladoRepository,
        exame,
      );
    }
    throw new Error('Tipo de prova não encontrado');
  }
}
