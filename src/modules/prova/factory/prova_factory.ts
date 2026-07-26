import { Injectable } from '@nestjs/common';
import { FrenteRepository } from 'src/modules/frente/frente.repository';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { SimuladoService } from 'src/modules/simulado/simulado.service';
import { CategoriaRepository } from 'src/modules/categoria/categoria.repository';
import { Categoria } from 'src/modules/categoria/schemas/categoria.schema';
import { ProvaRepository } from '../prova.repository';
import { EnemService } from '../services/enem_service';
import { CustomProvaFactory } from './custom_prova_factory';
import { Enem2010_2017Factory } from './enem_2010_2016_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';
import { ExameName, IProvaFactory } from './types';

@Injectable()
export class ProvaFactory {
  constructor(
    private readonly categoriaRepository: CategoriaRepository,
    private readonly questaoRepository: QuestaoRepository,
    private readonly provaRepository: ProvaRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly simuladoService: SimuladoService,
    private readonly simuladoRepository: SimuladoRepository,
    private readonly enemService: EnemService,
  ) {}

  public getFactory(categoria: Categoria, ano: number): IProvaFactory {
    if (categoria.custom) {
      return new CustomProvaFactory(
        this.questaoRepository,
        this.provaRepository,
        this.simuladoService,
        this.simuladoRepository,
        categoria,
      );
    }

    const exame = categoria.exame;
    if (exame.nome === ExameName.ENEM && ano > 2016) {
      return new Enem2017PlusFactory(
        this.categoriaRepository,
        this.questaoRepository,
        this.provaRepository,
        this.frenteRepository,
        this.simuladoService,
        this.simuladoRepository,
        this.enemService,
      );
    } else if (exame.nome === ExameName.ENEM && ano > 2009 && ano <= 2016) {
      return new Enem2010_2017Factory(
        this.categoriaRepository,
        this.questaoRepository,
        this.provaRepository,
        this.frenteRepository,
        this.simuladoService,
        this.simuladoRepository,
        this.enemService,
      );
    }
    throw new Error('Factory não encontrada');
  }
}
