import { Injectable } from '@nestjs/common';
import { Exame } from 'src/modules/exame/exame.schema';
import { FrenteRepository } from 'src/modules/frente/frente.repository';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { SimuladoService } from 'src/modules/simulado/simulado.service';
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { ProvaRepository } from '../prova.repository';
import { EnemService } from '../services/enem_service';
import { Enem2010_2017Factory } from './enem_2010_2016_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';
import { ExameName, IProvaFactory } from './types';

@Injectable()
export class ProvaFactory {
  constructor(
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly provaRepository: ProvaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly simuladoService: SimuladoService,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly enemService: EnemService,
  ) {}

  public getFactory(exame: Exame, ano: number): IProvaFactory {
    if (exame.nome === ExameName.ENEM && ano > 2016) {
      return new Enem2017PlusFactory(
        this.tipoSimuladoRepository,
        this.questaoRepository,
        this.provaRepository,
        this.frenteRepository,
        this.simuladoService,
        this.simuladoRepository,
        this.enemService,
        exame,
      );
    } else if (exame.nome === ExameName.ENEM && ano > 2009 && ano <= 2016) {
      return new Enem2010_2017Factory(
        this.tipoSimuladoRepository,
        this.questaoRepository,
        this.provaRepository,
        this.frenteRepository,
        this.simuladoService,
        this.simuladoRepository,
        this.enemService,
        exame,
      );
    }
    throw new Error('Factory não encontrada');
  }
}
