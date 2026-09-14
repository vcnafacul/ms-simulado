import { Injectable } from '@nestjs/common';
import { FrenteRepository } from 'src/modules/frente/frente.repository';
import { QuestaoRepository } from 'src/modules/questao/questao.repository';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { SimuladoService } from 'src/modules/simulado/simulado.service';
import { CategoriaRepository } from 'src/modules/categoria/categoria.repository';
import {
  Categoria,
  DONO_SYSTEM,
} from 'src/modules/categoria/schemas/categoria.schema';
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
    /**
     * ⚠️ **`dono` entra na condição de propósito.** Toda prova de categoria de
     * cursinho gera 1 simulado — é a regra do produto.
     *
     * Na prática `custom` já basta hoje, porque `CategoriaService.add` o força
     * a `true`. Mas isso é invariante em OUTRO arquivo: um update futuro, um
     * seed ou um ajuste manual no banco produziriam categoria de cursinho com
     * `custom: false`, e ela cairia na fábrica do ENEM — 5 simulados para quem
     * pediu 1, sem erro nenhum. A condição explícita custa uma linha.
     */
    if (categoria.custom || categoria.dono !== DONO_SYSTEM) {
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
