import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { ProvaRepository } from '../prova/prova.repository';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { CategoriaOutputDTO } from './dtos/categoria-output.dto';
import { Categoria, DONO_SYSTEM } from './schemas/categoria.schema';
import { CategoriaRepository } from './categoria.repository';

@Injectable()
export class CategoriaService {
  constructor(
    private readonly repository: CategoriaRepository,
    @Inject(forwardRef(() => SimuladoRepository))
    private readonly simuladoRepository: SimuladoRepository,
    @Inject(forwardRef(() => ProvaRepository))
    private readonly provaRepository: ProvaRepository,
  ) {}

  /**
   * ⚠️ `dono` é PARÂMETRO, nunca campo do DTO. Quem o define é a api, a partir
   * do JWT — mesma regra que o `cursinho-prova.controller` já aplica a
   * `criadorId`/`cursinhoId`. Com o dono vindo do corpo, o cursinho A criaria
   * categoria em nome do B mandando um campo a mais no JSON.
   */
  public async add(
    dto: CreateCategoriaDTOInput,
    dono: string = DONO_SYSTEM,
  ): Promise<Categoria> {
    const nomeAplicado = dto.nome ?? this.gerarNomeAuto(dto);

    // colisão ANTES do pattern: nomes seedados (ex.: "Enem Dia 1") não seguem
    // o pattern de categoria custom, então precisam bater 409 (não 400).
    const collision = await this.repository.getAtivaByNomeEDono(
      nomeAplicado,
      dono,
    );
    if (collision) {
      throw new ConflictException('Já existe uma categoria com esse nome');
    }

    this.validarPatternNome(nomeAplicado, dono);

    // backend é fonte de verdade: força os campos de segurança (ignora o DTO).
    const categoria = Object.assign(new Categoria(), dto, {
      nome: nomeAplicado,
      custom: true,
      selecionavel: true,
      dono,
    });

    return await this.repository.create(categoria);
  }

  private gerarNomeAuto(dto: CreateCategoriaDTOInput): string {
    // normaliza whitespace interno: o nome entra no índice único (hoje
    // composto, `{dono, nome}`), então "Mini  X" e "Mini X" não podem virar
    // categorias distintas para o mesmo dono.
    const prefixo = dto.prefixo?.trim().replace(/\s+/g, ' ') || 'Personalizado';
    const qtd = dto.quantidadeTotalQuestao ?? 'livre';
    const parteQtd = qtd === 'livre' ? 'livre' : `${qtd}q`;
    return `${prefixo} ${parteQtd} ${dto.duracao}min`;
  }

  /**
   * ⚠️ **Só vale para categoria da plataforma.** O pattern existe para o nome
   * ser autodescritivo numa lista global de dezenas de itens. Na lista de um
   * cursinho, com poucos itens e nomes que ele reconhece, ele custa mais do que
   * entrega — e impediria exatamente o caso de uso do ticket ("Enem Dia 1").
   */
  private validarPatternNome(nome: string, dono: string): void {
    if (dono !== DONO_SYSTEM) return;

    const pattern = /^(?:\S+\s+)*?(?:\d+q|livre)\s+\d+min$/;
    if (!pattern.test(nome)) {
      throw new BadRequestException(
        `Nome '${nome}' não segue o pattern '<Prefixo> <Nq>|livre <Dmin>' (ex.: 'Personalizado 30q 60min')`,
      );
    }
  }

  public async getById(id: string): Promise<CategoriaOutputDTO | null> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      return null;
    }
    const [comUso] = await this.attachUsageCounts([categoria]);
    return comUso;
  }

  public async getAll(
    param: GetAllInput,
    dono: string = DONO_SYSTEM,
  ): Promise<GetAllOutput<CategoriaOutputDTO>> {
    /**
     * ⚠️ O filtro é sempre aplicado — não existe "listar todas". Uma chamada
     * sem dono devolve as do sistema, e não o universo: um default permissivo
     * aqui vazaria as categorias de um cursinho para os outros no dia em que
     * alguém esquecesse de passar o parâmetro.
     */
    const result = await this.repository.getAll({ ...param, where: { dono } });
    return {
      ...result,
      data: await this.attachUsageCounts(result.data),
    };
  }

  public async delete(id: string, dono: string = DONO_SYSTEM): Promise<void> {
    const categoria = await this.repository.getById(id);
    if (!categoria) {
      throw new NotFoundException(`Categoria ${id} não encontrada`);
    }

    /**
     * ⚠️ **A verificação de dono vem ANTES da de uso.** Invertido, o cursinho A
     * descobriria, pela mensagem de erro, quantas provas e simulados o cursinho
     * B tem numa categoria dele.
     */
    if (categoria.dono !== dono) {
      throw new ForbiddenException('Categoria de outro dono');
    }

    const [simuladosUsando, provasUsando] = await Promise.all([
      this.simuladoRepository.countByCategoria(id),
      this.provaRepository.countByCategoria(id),
    ]);
    if (simuladosUsando > 0 || provasUsando > 0) {
      throw new ConflictException({
        message: 'Categoria em uso e não pode ser excluída',
        simuladosUsando,
        provasUsando,
      });
    }

    await this.repository.delete(id);
  }

  private async attachUsageCounts(
    categorias: Categoria[],
  ): Promise<CategoriaOutputDTO[]> {
    const ids = categorias.map((c) => c._id.toString());
    const [simuladoCounts, provaCounts] = await Promise.all([
      this.simuladoRepository.countsByCategoria(ids),
      this.provaRepository.countsByCategoria(ids),
    ]);
    return categorias.map((categoria) => {
      const plain =
        typeof (categoria as any).toObject === 'function'
          ? (categoria as any).toObject()
          : categoria;
      const id = plain._id.toString();
      return {
        ...plain,
        simuladosCount: simuladoCounts[id] ?? 0,
        provasCount: provaCounts[id] ?? 0,
      } as CategoriaOutputDTO;
    });
  }
}
