import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Frente } from 'src/modules/frente/frente.schema';
import { CreateQuestaoDTOInput } from 'src/modules/questao/dtos/create.dto.input';
import { UpdateDTOInput } from 'src/modules/questao/dtos/update.dto.input';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { SimuladoRepository } from 'src/modules/simulado/simulado.repository';
import { Simulado } from 'src/modules/simulado/schemas/simulado.schema';
import { CategoriaRepository } from 'src/modules/categoria/categoria.repository';
import { ProvaRepository } from '../prova.repository';
import { Prova } from '../prova.schema';

@Injectable()
export class EnemService {
  constructor(
    private readonly simuladoRepository: SimuladoRepository,
    private readonly categoriaRepository: CategoriaRepository,
    private readonly provarepository: ProvaRepository,
  ) {}

  public async createSimuladoIdiomatica(prova: Prova) {
    const mainName = `${prova.categoria.nome} ${prova.ano}`;
    const exameId = prova.categoria.exame._id.toString();
    await this.createSimuladoLinguagem(prova);
    prova.simulados.push(
      await this.simuladoRepository.create({
        nome: `${mainName} Inglês`,
        categoria: prova.categoria,
        questoes: [],
        descricao: `${prova.categoria.exame.nome} Inglês`,
      }),
    );
    prova.simulados.push(
      await this.simuladoRepository.create({
        nome: `${mainName} Espanhol`,
        categoria: prova.categoria,
        questoes: [],
        descricao: `${prova.categoria.exame.nome} Espanhol`,
      }),
    );
  }

  public async createSimuladoLinguagem(prova: Prova) {
    const mainName = `${prova.categoria.nome} ${prova.ano}`;
    const exameId = prova.categoria.exame._id.toString();
    prova.simulados.push(
      await this.createSimuladoArea(mainName, EnemArea.Linguagens, exameId, 'Inglês'),
    );
    prova.simulados.push(
      await this.createSimuladoArea(mainName, EnemArea.Linguagens, exameId, 'Espanhol'),
    );
  }

  public async createSimuladoArea(
    defaultName: string,
    nomeTipo: string,
    exameId: string,
    complemento?: string,
  ) {
    const simuladoArea = new Simulado();
    const categoria = await this.categoriaRepository.getByFilter({
      nome: nomeTipo,
      exame: exameId,
    });
    simuladoArea.categoria = categoria;
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
