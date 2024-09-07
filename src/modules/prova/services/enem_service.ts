import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Frente } from 'src/modules/frente/frente.schema';
import { CreateQuestaoDTOInput } from 'src/modules/questao/dtos/create.dto.input';
import { UpdateDTOInput } from 'src/modules/questao/dtos/update.dto.input';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { TipoSimuladoRepository } from 'src/modules/tipo-simulado/tipo-simulado.repository';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';

@Injectable()
export class EnemService {
  constructor(
    private readonly simuladoRepository: SimuladoRepository,
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
    private readonly provarepository: ProvaRepository,
  ) {}

  public async createSimuladoIdiomatica(prova: Prova) {
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    await this.createSimuladoLinguagem(prova);
    prova.simulados.push(
      await this.simuladoRepository.create({
        nome: `${mainName} Inglês`,
        tipo: prova.tipo,
        questoes: [],
        descricao: `${prova.exame.nome} Inglês`,
      }),
    );
    prova.simulados.push(
      await this.simuladoRepository.create({
        nome: `${mainName} Espanhol`,
        tipo: prova.tipo,
        questoes: [],
        descricao: `${prova.exame.nome} Espanhol`,
      }),
    );
  }

  public async createSimuladoLinguagem(prova: Prova) {
    const mainName = `${prova.tipo.nome} ${prova.ano}`;
    prova.simulados.push(
      await this.createSimuladoArea(mainName, EnemArea.Linguagens, 'Inglês'),
    );
    prova.simulados.push(
      await this.createSimuladoArea(mainName, EnemArea.Linguagens, 'Espanhol'),
    );
  }

  public async createSimuladoArea(
    defaultName: string,
    nomeTipo: string,
    complemento?: string,
  ) {
    const simuladoArea = new Simulado();
    const tipo = await this.tipoSimuladoRepository.getByFilter({
      nome: nomeTipo,
    });
    simuladoArea.tipo = tipo;
    simuladoArea.nome = `${defaultName} ${nomeTipo}`;
    if (complemento) {
      simuladoArea.nome = `${simuladoArea.nome} ${complemento}`;
    }
    return await this.simuladoRepository.create(simuladoArea);
  }

  public async getByName(nome: string): Promise<Prova> {
    return await this.provarepository.getByFilter({ nome });
  }

  public async validate(
    question: CreateQuestaoDTOInput | UpdateDTOInput,
    frenteIngles: Frente,
    frenteEspanhol: Frente,
    minNumber: number,
    maxNumber: number,
  ) {
    if (!frenteIngles && !frenteEspanhol) {
      throw new HttpException(
        'Erro ao buscar frente de Inglês e Espanhol',
        HttpStatus.CONFLICT,
      );
    }

    if (question.numero >= minNumber && question.numero <= maxNumber) {
      if (
        !question.frente1 ||
        ![frenteIngles._id.toString(), frenteEspanhol._id.toString()].includes(
          question.frente1,
        )
      ) {
        throw new HttpException(
          `Para editar uma questão com número entre ${minNumber} e ${maxNumber}, é necessário informar um frente de Inglês ou Espanhol`,
          HttpStatus.CONFLICT,
        );
      }
    } else {
      if (question.frente1) {
        if (
          [frenteIngles._id.toString(), frenteEspanhol._id.toString()].includes(
            question.frente1,
          )
        ) {
          throw new HttpException(
            `Só é possível atribuir a frente Inglês ou Espanhol para questões com número entre ${minNumber} e ${maxNumber}`,
            HttpStatus.CONFLICT,
          );
        }
      }
    }
  }
}
