import { Injectable } from '@nestjs/common';
import { Exame } from 'src/modules/exame/exame.schema';
import { SimuladoRepository } from 'src/modules/simulado/repository/simulado.repository';
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { ProvaRepository } from '../prova.repository';
import { EnemPlus2016Factory } from './enem_plus_2016_factory';
import { IProvaFactory } from './types';

enum ExameName {
  ENEM = 'ENEM',
}

@Injectable()
export class ProvaFactory {
  constructor(
    private readonly provarepository: ProvaRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly simuladoRepository: SimuladoRepository,
  ) {}

  public getFactory(exame: Exame, ano: number): IProvaFactory {
    if (exame.nome === ExameName.ENEM && ano > 2016) {
      return new EnemPlus2016Factory(
        this.provarepository,
        this.tipoSimuladoRepository,
        this.simuladoRepository,
        exame,
      );
    }
    throw new Error('Factory não encontrada');
  }
}
