import { Injectable, NotFoundException } from '@nestjs/common';
import { FrenteRepository } from '../frente/frente.repository';
import { MateriaRepository } from '../materia/materia.repository';
import { ColaboradorRepository } from './colaborador.repository';
import { Colaborador } from './colaborador.schema';
import { SaveAfinidadesDTOInput } from './dtos/save-afinidades.dto.input';

@Injectable()
export class ColaboradorService {
  constructor(
    private readonly repository: ColaboradorRepository,
    private readonly frenteRepository: FrenteRepository,
    private readonly materiaRepository: MateriaRepository,
  ) {}

  /**
   * Busca afinidades de um colaborador
   * Retorna null se o colaborador não existir (não foi cadastrado ainda)
   */
  async getAfinidades(colaboradorId: string): Promise<
    | {
        frenteId: string;
        frenteNome: string;
        materiaId: string;
        materiaNome: string;
        adicionadoEm: Date;
      }[]
    | null
  > {
    const colaborador =
      await this.repository.findByColaboradorId(colaboradorId);

    if (!colaborador) {
      return null; // Colaborador não possui afinidades cadastradas
    }

    return colaborador.afinidades;
  }

  /**
   * Salva/Atualiza afinidades de um colaborador
   * Se não existir, cria automaticamente (UPSERT)
   * Se existir, atualiza as afinidades
   */
  async saveAfinidades(dto: SaveAfinidadesDTOInput): Promise<Colaborador> {
    // Busca dados das frentes e matérias para desnormalizar
    const afinidades = [];

    for (const frenteId of dto.frentesIds) {
      const frente = await this.frenteRepository.getById(frenteId);

      if (!frente) {
        throw new NotFoundException(`Frente ${frenteId} não encontrada`);
      }

      const materia = await this.materiaRepository.getById(
        frente.materia.toString(),
      );

      if (!materia) {
        throw new NotFoundException(`Matéria ${frente.materia} não encontrada`);
      }

      afinidades.push({
        frenteId: frente._id.toString(),
        frenteNome: frente.nome,
        materiaId: materia._id.toString(),
        materiaNome: materia.nome,
        adicionadoEm: new Date(),
      });
    }

    // UPSERT: Cria se não existe, atualiza se existe
    const colaborador = await this.repository.upsert(dto.colaboradorId, {
      colaboradorId: dto.colaboradorId,
      nome: dto.nome,
      email: dto.email,
      userId: dto.userId,
      afinidades,
    });

    return colaborador;
  }

  /**
   * Adiciona uma afinidade específica
   * Cria o colaborador se não existir
   */
  async addAfinidade(
    colaboradorId: string,
    nome: string,
    email: string,
    userId: string,
    frenteId: string,
  ): Promise<Colaborador> {
    let colaborador = await this.repository.findByColaboradorId(colaboradorId);

    // Busca dados da frente
    const frente = await this.frenteRepository.getById(frenteId);
    if (!frente) {
      throw new NotFoundException(`Frente ${frenteId} não encontrada`);
    }

    const materia = await this.materiaRepository.getById(
      frente.materia.toString(),
    );

    const novaAfinidade = {
      frenteId: frente._id.toString(),
      frenteNome: frente.nome,
      materiaId: materia._id.toString(),
      materiaNome: materia.nome,
      adicionadoEm: new Date(),
    };

    if (!colaborador) {
      // Cria novo colaborador com a afinidade
      colaborador = await this.repository.upsert(colaboradorId, {
        colaboradorId,
        nome,
        email,
        userId,
        afinidades: [novaAfinidade],
      });
    } else {
      // Verifica se já existe
      const jaExiste = colaborador.afinidades.some(
        (a) => a.frenteId === frenteId,
      );

      if (!jaExiste) {
        colaborador.afinidades.push(novaAfinidade);
        await this.repository.update(colaborador);
      }
    }

    return colaborador;
  }

  /**
   * Remove uma afinidade específica
   * Retorna null se o colaborador não existir
   */
  async removeAfinidade(
    colaboradorId: string,
    frenteId: string,
  ): Promise<Colaborador | null> {
    const colaborador =
      await this.repository.findByColaboradorId(colaboradorId);

    if (!colaborador) {
      return null;
    }

    colaborador.afinidades = colaborador.afinidades.filter(
      (a) => a.frenteId !== frenteId,
    );

    await this.repository.update(colaborador);
    return colaborador;
  }

  /**
   * Busca colaboradores por frente (para relatórios)
   */
  async findByFrente(frenteId: string): Promise<Colaborador[]> {
    return await this.repository.findByFrenteId(frenteId);
  }

  /**
   * Busca colaboradores por matéria (para relatórios)
   */
  async findByMateria(materiaId: string): Promise<Colaborador[]> {
    return await this.repository.findByMateriaId(materiaId);
  }
}
