import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Historico } from '../historico/historico.schema';
import { AggregatePayload, UserGroupAggregate } from './user-group-aggregate.schema';

export { AggregatePayload };

@Injectable()
export class UserGroupAggregateRepository {
  constructor(
    @InjectModel(UserGroupAggregate.name)
    private readonly aggModel: Model<UserGroupAggregate>,
    @InjectModel(Historico.name)
    private readonly histModel: Model<Historico>,
  ) {}

  async findOneByMonth(
    groupId: string,
    groupType: 'class',
    month: string,
  ): Promise<UserGroupAggregate | null> {
    return this.aggModel.findOne({ groupId, groupType, month }).lean();
  }

  async listByGroup(
    groupId: string,
    groupType: 'class',
  ): Promise<UserGroupAggregate[]> {
    return this.aggModel
      .find({ groupId, groupType })
      .sort({ month: -1 })
      .lean();
  }

  async upsert(doc: Partial<UserGroupAggregate>): Promise<UserGroupAggregate> {
    return this.aggModel
      .findOneAndUpdate(
        { groupId: doc.groupId, groupType: doc.groupType, month: doc.month },
        { $set: doc },
        { new: true, upsert: true },
      )
      .lean();
  }

  async aggregateMonth(input: {
    userIds: string[];
    monthStart: Date;
    monthEnd: Date;
  }): Promise<{ payload: AggregatePayload }> {
    if (input.userIds.length === 0) {
      return {
        payload: {
          geral: 0,
          totalAttempts: 0,
          totalAttemptsCompleted: 0,
          studentsWithAtLeastOneCompletedAttempt: 0,
          materias: [],
        },
      };
    }

    const baseMatch = {
      usuario: { $in: input.userIds },
      createdAt: { $gte: input.monthStart, $lte: input.monthEnd },
      deleted: { $ne: true },
    };

    const totalAttempts = await this.histModel.countDocuments(baseMatch);

    const [facetResult] = await this.histModel.aggregate([
      { $match: baseMatch },
      {
        $match: {
          $expr: { $eq: [{ $size: '$respostas' }, '$questoesRespondidas'] },
        },
      },
      {
        $facet: {
          completedRows: [
            { $unwind: '$aproveitamento.materias' },
            { $unwind: '$aproveitamento.materias.frentes' },
            {
              $group: {
                _id: {
                  usuario: '$usuario',
                  materiaId: '$aproveitamento.materias.id',
                  materiaNome: '$aproveitamento.materias.nome',
                  frenteId: '$aproveitamento.materias.frentes.id',
                  frenteNome: '$aproveitamento.materias.frentes.nome',
                },
                avg: {
                  $avg: '$aproveitamento.materias.frentes.aproveitamento',
                },
                attempts: { $sum: 1 },
              },
            },
          ],
          completedCount: [{ $count: 'total' }],
          completedUsers: [
            { $group: { _id: '$usuario' } },
            { $count: 'total' },
          ],
        },
      },
    ]);

    return { payload: this.buildPayload(facetResult, { totalAttempts }) };
  }

  private buildPayload(
    facetResult: {
      completedRows: any[];
      completedCount: any[];
      completedUsers: any[];
    },
    meta: { totalAttempts: number },
  ): AggregatePayload {
    const { completedRows, completedCount, completedUsers } = facetResult;
    const totalAttemptsCompleted = completedCount[0]?.total ?? 0;
    const studentsWithAtLeastOneCompletedAttempt =
      completedUsers[0]?.total ?? 0;

    const materiaMap = new Map<
      string,
      {
        id: string;
        nome: string;
        frenteMap: Map<
          string,
          {
            id: string;
            nome: string;
            studentAvgs: number[];
            attempts: number;
          }
        >;
        studentIds: Set<string>;
      }
    >();

    for (const row of completedRows) {
      const { materiaId, materiaNome, frenteId, frenteNome, usuario } = row._id;

      if (!materiaMap.has(materiaId)) {
        materiaMap.set(materiaId, {
          id: materiaId,
          nome: materiaNome,
          frenteMap: new Map(),
          studentIds: new Set(),
        });
      }
      const mat = materiaMap.get(materiaId)!;
      mat.studentIds.add(usuario);

      if (!mat.frenteMap.has(frenteId)) {
        mat.frenteMap.set(frenteId, {
          id: frenteId,
          nome: frenteNome,
          studentAvgs: [],
          attempts: 0,
        });
      }
      const fr = mat.frenteMap.get(frenteId)!;
      fr.studentAvgs.push(row.avg);
      fr.attempts += row.attempts;
    }

    const materias = Array.from(materiaMap.values()).map((mat) => {
      const frentes = Array.from(mat.frenteMap.values()).map((fr) => ({
        id: fr.id,
        nome: fr.nome,
        aproveitamento:
          fr.studentAvgs.length > 0
            ? fr.studentAvgs.reduce((a, b) => a + b, 0) / fr.studentAvgs.length
            : 0,
        studentsContributing: fr.studentAvgs.length,
        attemptsContributing: fr.attempts,
      }));

      const totalWeight = frentes.reduce(
        (s, f) => s + f.studentsContributing,
        0,
      );
      const aproveitamento =
        totalWeight > 0
          ? frentes.reduce(
              (s, f) => s + f.aproveitamento * f.studentsContributing,
              0,
            ) / totalWeight
          : 0;

      return {
        id: mat.id,
        nome: mat.nome,
        aproveitamento,
        studentsContributing: mat.studentIds.size,
        attemptsContributing: frentes.reduce(
          (s, f) => s + f.attemptsContributing,
          0,
        ),
        frentes,
      };
    });

    const geral =
      materias.length > 0
        ? materias.reduce((s, m) => s + m.aproveitamento, 0) / materias.length
        : 0;

    return {
      geral,
      totalAttempts: meta.totalAttempts,
      totalAttemptsCompleted,
      studentsWithAtLeastOneCompletedAttempt,
      materias,
    };
  }
}
