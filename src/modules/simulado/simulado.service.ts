import { Injectable } from '@nestjs/common';
import { SimuladoRepository } from './simulado.repository';
import { TipoSimuladoService } from '../tipo-simulado/tipo-simulado.service';
import { QuestaoService } from '../questao/questao.service';
import { TipoSimulado } from '../tipo-simulado/schemas/tipo-simulado.schema';
import { getDateNow } from 'src/utils/date';

@Injectable()
export class SimuladoService {
  constructor(
    private readonly repository: SimuladoRepository,
    private readonly tipoSimuladoService: TipoSimuladoService,
    private readonly questaoService: QuestaoService,
  ) {}

  public async Create(idTipo: string): Promise<number | null> {
    try {
      const oldSimulado = await this.repository.findOne({
        tipo: idTipo,
        bloqueado: false,
      });
      if (!!oldSimulado) {
        oldSimulado.bloqueado = true;
        oldSimulado.save();
      }
      const tipo = await this.tipoSimuladoService.getById(idTipo);
      const questoes = await this.questaoService.GetManyByRules(
        tipo as TipoSimulado,
      );
      const simulado = await this.repository.create({
        nome: `${tipo?.nome} ${getDateNow()}`,
        descricao: `Simulado de ${tipo?.nome}`,
        tipo: tipo,
        questoes: questoes,
      });
      return simulado._id;
    } catch (error) {
      console.error(error);
      return 0;
    }
  }
}
