import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { Categoria } from './schemas/categoria.schema';
import { CategoriaRepository } from './categoria.repository';

@Injectable()
export class CategoriaService {
  constructor(
    private readonly repository: CategoriaRepository,
    @Inject(forwardRef(() => SimuladoRepository))
    private readonly simuladoRepository: SimuladoRepository,
  ) {}

  public async add(dto: CreateCategoriaDTOInput): Promise<Categoria> {
    const nomeAplicado = dto.nome ?? this.gerarNomeAuto(dto);

    // colisão ANTES do pattern: nomes seedados (ex.: "Enem Dia 1") não seguem
    // o pattern de categoria custom, então precisam bater 409 (não 400).
    const collision = await this.repository.getByFilter({ nome: nomeAplicado });
    if (collision) {
      throw new ConflictException('Já existe uma categoria com esse nome');
    }

    this.validarPatternNome(nomeAplicado);

    // backend é fonte de verdade: força os campos de segurança (ignora o DTO).
    const categoria = Object.assign(new Categoria(), dto, {
      nome: nomeAplicado,
      custom: true,
      selecionavel: true,
    });

    return await this.repository.create(categoria);
  }

  private gerarNomeAuto(dto: CreateCategoriaDTOInput): string {
    // normaliza whitespace interno: nome tem índice unique, então "Mini  X" e
    // "Mini X" não podem virar categorias distintas.
    const prefixo = dto.prefixo?.trim().replace(/\s+/g, ' ') || 'Personalizado';
    const qtd = dto.quantidadeTotalQuestao ?? 'livre';
    const parteQtd = qtd === 'livre' ? 'livre' : `${qtd}q`;
    return `${prefixo} ${parteQtd} ${dto.duracao}min`;
  }

  private validarPatternNome(nome: string): void {
    const pattern = /^(?:\S+\s+)*?(?:\d+q|livre)\s+\d+min$/;
    if (!pattern.test(nome)) {
      throw new BadRequestException(
        `Nome '${nome}' não segue o pattern '<Prefixo> <Nq>|livre <Dmin>' (ex.: 'Personalizado 30q 60min')`,
      );
    }
  }

  public async getById(id: string): Promise<Categoria> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Categoria>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }

    const simuladosUsando = await this.simuladoRepository.countByCategoria(id);
    if (simuladosUsando > 0) {
      throw new ConflictException({
        message: 'Categoria em uso e não pode ser excluída',
        simuladosUsando,
      });
    }

    await this.repository.delete(id);
  }
}
