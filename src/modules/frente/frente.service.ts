import { Injectable } from '@nestjs/common';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { MateriaRepository } from '../materia/materia.repository';
import { CreateFrenteDTOInput } from './dtos/create.dto.input';
import { FrenteRepository } from './frente.repository';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteService {
  constructor(
    private readonly repository: FrenteRepository,
    private readonly materiaRepository: MateriaRepository,
  ) {}

  public async add(item: CreateFrenteDTOInput): Promise<Frente> {
    // Busca o maior order existente para a matéria
    const maxOrder = await this.repository.getMaxOrder(item.materia);

    const frente = Object.assign(new Frente(), {
      ...item,
      order: maxOrder + 1,
    });
    const createdFrente = await this.repository.create(frente);

    // Busca a matéria e adiciona a frente ao array frentes
    const materia = await this.materiaRepository.getById(item.materia);

    if (!materia.frentes) {
      materia.frentes = [];
    }
    materia.frentes.push(createdFrente);

    await this.materiaRepository.update(materia);

    return createdFrente;
  }

  public async getById(id: string): Promise<Frente> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllDtoInput): Promise<GetAllDtoOutput<Frente>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async swapOrder(id1: string, id2: string): Promise<void> {
    const frente1 = await this.repository.getById(id1);
    const frente2 = await this.repository.getById(id2);

    const tempOrder = frente1.order;
    frente1.order = frente2.order;
    frente2.order = tempOrder;

    await this.repository.update(frente1);
    await this.repository.update(frente2);
  }

  public async moveToPosition(
    frenteId: string,
    newPosition: number,
    materiaId: string,
  ): Promise<void> {
    const frente = await this.repository.getById(frenteId);
    const oldPosition = frente.order;

    if (oldPosition === newPosition) return;

    const allFrentes = await this.repository.findByMateria(materiaId);

    if (newPosition < oldPosition) {
      const toUpdate = allFrentes.filter(
        (f) => f.order >= newPosition && f.order < oldPosition,
      );
      for (const f of toUpdate) {
        f.order += 1;
        await this.repository.update(f);
      }
    } else {
      const toUpdate = allFrentes.filter(
        (f) => f.order > oldPosition && f.order <= newPosition,
      );
      for (const f of toUpdate) {
        f.order -= 1;
        await this.repository.update(f);
      }
    }

    frente.order = newPosition;
    await this.repository.update(frente);
  }

  public async moveUp(id: string, materiaId: string): Promise<void> {
    const frente = await this.repository.getById(id);
    if (frente.order > 0) {
      await this.moveToPosition(id, frente.order - 1, materiaId);
    }
  }

  public async moveDown(id: string, materiaId: string): Promise<void> {
    const frente = await this.repository.getById(id);
    const count = await this.repository.countByMateria(materiaId);
    if (frente.order < count - 1) {
      await this.moveToPosition(id, frente.order + 1, materiaId);
    }
  }

  public async moveToTop(id: string, materiaId: string): Promise<void> {
    await this.moveToPosition(id, 0, materiaId);
  }

  public async moveToBottom(id: string, materiaId: string): Promise<void> {
    const count = await this.repository.countByMateria(materiaId);
    await this.moveToPosition(id, count - 1, materiaId);
  }
}
