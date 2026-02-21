import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { Content } from '../content/content.schema';
import { StatusContent } from '../content/enums/status-content.enum';
import { Subject } from '../subject/subject.schema';
import { Frente } from './frente.schema';

@Injectable()
export class FrenteRepository extends BaseRepository<Frente> {
  constructor(
    @InjectModel(Frente.name) model: Model<Frente>,
    @InjectModel(Subject.name) private readonly subjectModel: Model<Subject>,
    @InjectModel(Content.name) private readonly contentModel: Model<Content>,
  ) {
    super(model);
  }

  async getByMateria(materiaId: string): Promise<Frente[]> {
    return this.model.find({
      materia: new Types.ObjectId(materiaId),
      deleted: { $ne: true },
    });
  }

  /**
   * Retorna frentes da matéria que possuem pelo menos um subject
   * com pelo menos um content aprovado. Usa find() do Mongoose (documentação oficial).
   */
  async getByMateriaWithApprovedContent(materiaId: string): Promise<any[]> {
    const materiaObjectId = new Types.ObjectId(materiaId);
    const frentes = await this.model
      .find({ materia: materiaObjectId, deleted: { $ne: true } })
      .lean();
    if (frentes.length === 0) return [];

    const frenteIds = frentes.map((f) => f._id.toString());
    const subjects = await this.subjectModel
      .find({ frente: { $in: frenteIds }, deleted: { $ne: true } })
      .sort({ order: 1 })
      .lean();

    if (subjects.length === 0) return [];
    const subjectIds = subjects.map((s) => s._id.toString());

    const contents = await this.contentModel
      .find({
        subject: { $in: subjectIds },
        status: StatusContent.Approved,
        deleted: { $ne: true },
      })
      .sort({ order: 1 })
      .lean();

    const contentsBySubjectId = new Map<string, any[]>();
    for (const c of contents) {
      const sid = String((c as any).subject);
      if (!contentsBySubjectId.has(sid)) contentsBySubjectId.set(sid, []);
      contentsBySubjectId.get(sid)!.push(c);
    }

    const subjectsWithContents = subjects
      .map((s) => ({
        ...s,
        contents: contentsBySubjectId.get(String(s._id)) ?? [],
      }))
      .filter((s) => (s as any).contents.length > 0);

    const subjectsByFrenteId = new Map<string, any[]>();
    for (const s of subjectsWithContents) {
      const fid = String((s as any).frente);
      if (!subjectsByFrenteId.has(fid)) subjectsByFrenteId.set(fid, []);
      subjectsByFrenteId.get(fid)!.push(s);
    }

    return frentes
      .map((f) => ({
        ...f,
        subjects: subjectsByFrenteId.get(String(f._id)) ?? [],
      }))
      .filter((f) => (f as any).subjects.length > 0);
  }
}
