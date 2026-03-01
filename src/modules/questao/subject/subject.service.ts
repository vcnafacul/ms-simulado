import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Content } from 'src/modules/content/content.schema';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateSubjectDTOInput } from './dtos/create-subject.dto.input';
import { GetAllSubjectDtoInput } from './dtos/get-all-subject.dto.input';
import { UpdateSubjectDTOInput } from './dtos/update-subject.dto.input';
import { SubjectRepository } from './subject.repository';
import { Subject } from './subject.schema';

@Injectable()
export class SubjectService {
  constructor(
    private readonly repository: SubjectRepository,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
  ) {}

  async add(item: CreateSubjectDTOInput): Promise<Subject> {
    const isUnique = await this.repository.isUnique(item.frente, item.name);
    if (!isUnique) {
      throw new HttpException(
        `Já existe um tema "${item.name}" nessa frente.`,
        HttpStatus.CONFLICT,
      );
    }

    const order = await this.repository.getNextOrder(item.frente);
    const subject = Object.assign(new Subject(), { ...item, order });
    return await this.repository.create(subject);
  }

  async getById(id: string): Promise<Subject> {
    return await this.repository.getById(id);
  }

  async getAll(
    param: GetAllSubjectDtoInput,
  ): Promise<GetAllDtoOutput<Subject>> {
    const where: any = {};
    if (param.frente) where.frente = param.frente;
    return await this.repository.getAll({ ...param, where });
  }

  async getByFrente(frenteId: string): Promise<Subject[]> {
    return await this.repository.getByFrente(frenteId);
  }

  async update(id: string, dto: UpdateSubjectDTOInput): Promise<void> {
    const subject = await this.repository.getById(id);
    if (!subject) {
      throw new HttpException(
        `Tema não encontrado com ID ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }
    const updated = Object.assign(subject, dto);
    await this.repository.update(updated);
  }

  async changeOrder(subjectId: string, newOrder: number): Promise<void> {
    const subject = await this.repository.getById(subjectId);
    if (!subject) {
      throw new HttpException(
        `Tema não encontrado com ID ${subjectId}`,
        HttpStatus.NOT_FOUND,
      );
    }
    subject.order = newOrder;
    await this.repository.update(subject);
  }

  async swapOrder(id1: string, id2: string): Promise<void> {
    const s1 = await this.repository.getById(id1);
    const s2 = await this.repository.getById(id2);
    if (!s1 || !s2) {
      throw new HttpException('Tema não encontrado', HttpStatus.NOT_FOUND);
    }
    const tempOrder = s1.order;
    s1.order = s2.order;
    s2.order = tempOrder;
    await this.repository.update(s1);
    await this.repository.update(s2);
  }

  async delete(id: string): Promise<void> {
    const demands = await this.contentModel.countDocuments({
      subject: id,
      deleted: { $ne: true },
    });
    if (demands > 0) {
      throw new HttpException(
        'Não é possível deletar este tema pois existem demandas vinculadas.',
        HttpStatus.CONFLICT,
      );
    }
    await this.repository.delete(id);
  }
}
