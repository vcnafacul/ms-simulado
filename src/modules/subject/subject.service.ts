import { Injectable } from '@nestjs/common';
import { GetAllInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';
import { FrenteRepository } from '../frente/frente.repository';
import { CreateSubjectDTOInput } from './dtos/create.dto.input';
import { SubjectRepository } from './subject.repository';
import { Subject } from './subject.schema';

@Injectable()
export class SubjectService {
  constructor(
    private readonly repository: SubjectRepository,
    private readonly frenteRepository: FrenteRepository,
  ) {}

  public async add(item: CreateSubjectDTOInput): Promise<Subject> {
    // Busca o maior order existente para a frente
    const maxOrder = await this.repository.getMaxOrder(item.frente);

    const subject = Object.assign(new Subject(), {
      ...item,
      order: maxOrder + 1,
    });
    const createdSubject = await this.repository.create(subject);

    // Busca a frente e adiciona o subject ao array subjects
    const frente = await this.frenteRepository.getById(item.frente);

    if (!frente.subjects) {
      frente.subjects = [];
    }
    frente.subjects.push(createdSubject);

    await this.frenteRepository.update(frente);

    return createdSubject;
  }

  public async getById(id: string): Promise<Subject> {
    return await this.repository.getById(id);
  }

  public async getAll(param: GetAllInput): Promise<GetAllOutput<Subject>> {
    return await this.repository.getAll(param);
  }

  public async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  public async swapOrder(id1: string, id2: string): Promise<void> {
    const subject1 = await this.repository.getById(id1);
    const subject2 = await this.repository.getById(id2);

    const tempOrder = subject1.order;
    subject1.order = subject2.order;
    subject2.order = tempOrder;

    await this.repository.update(subject1);
    await this.repository.update(subject2);
  }

  public async moveToPosition(
    subjectId: string,
    newPosition: number,
    frenteId: string,
  ): Promise<void> {
    const subject = await this.repository.getById(subjectId);
    const oldPosition = subject.order;

    if (oldPosition === newPosition) return;

    const allSubjects = await this.repository.findByFrente(frenteId);

    if (newPosition < oldPosition) {
      const toUpdate = allSubjects.filter(
        (s) => s.order >= newPosition && s.order < oldPosition,
      );
      for (const s of toUpdate) {
        s.order += 1;
        await this.repository.update(s);
      }
    } else {
      const toUpdate = allSubjects.filter(
        (s) => s.order > oldPosition && s.order <= newPosition,
      );
      for (const s of toUpdate) {
        s.order -= 1;
        await this.repository.update(s);
      }
    }

    subject.order = newPosition;
    await this.repository.update(subject);
  }

  public async moveUp(id: string, frenteId: string): Promise<void> {
    const subject = await this.repository.getById(id);
    if (subject.order > 0) {
      await this.moveToPosition(id, subject.order - 1, frenteId);
    }
  }

  public async moveDown(id: string, frenteId: string): Promise<void> {
    const subject = await this.repository.getById(id);
    const count = await this.repository.countByFrente(frenteId);
    if (subject.order < count - 1) {
      await this.moveToPosition(id, subject.order + 1, frenteId);
    }
  }

  public async moveToTop(id: string, frenteId: string): Promise<void> {
    await this.moveToPosition(id, 0, frenteId);
  }

  public async moveToBottom(id: string, frenteId: string): Promise<void> {
    const count = await this.repository.countByFrente(frenteId);
    await this.moveToPosition(id, count - 1, frenteId);
  }
}
