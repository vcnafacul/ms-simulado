import { Types } from 'mongoose';
import { UserGroupAggregateRepository } from './user-group-aggregate.repository';

describe('UserGroupAggregateRepository.buildPayload', () => {
  const repo = new UserGroupAggregateRepository({} as any, {} as any);

  function call(rows: any[], totalAttempts = rows.length) {
    return (repo as any).buildPayload(
      {
        completedRows: rows,
        completedCount: [{ total: rows.length }],
        completedUsers: [{ total: new Set(rows.map((r) => String(r._id.usuario))).size }],
      },
      { totalAttempts },
    );
  }

  it('deduplica matéria/frente quando os ids vêm como ObjectId do Mongo', () => {
    // Reproduz o bug: 1 matéria "Matemática" com 3 frentes do mesmo aluno.
    // Antes da correção: cada frente virava uma matéria separada por causa
    // da comparação de ObjectId por referência no Map.
    const materiaId = new Types.ObjectId();
    const usuario = new Types.ObjectId();
    const rows = [
      {
        _id: {
          usuario,
          materiaId,
          materiaNome: 'Matemática',
          frenteId: new Types.ObjectId(),
          frenteNome: 'Aritmética',
        },
        avg: 0.8,
        attempts: 1,
      },
      {
        _id: {
          usuario,
          materiaId,
          materiaNome: 'Matemática',
          frenteId: new Types.ObjectId(),
          frenteNome: 'Álgebra',
        },
        avg: 0.5,
        attempts: 1,
      },
      {
        _id: {
          usuario,
          materiaId,
          materiaNome: 'Matemática',
          frenteId: new Types.ObjectId(),
          frenteNome: 'Geometria',
        },
        avg: 0.2,
        attempts: 1,
      },
    ];

    const payload = call(rows);

    expect(payload.materias).toHaveLength(1);
    const mat = payload.materias[0];
    expect(mat.nome).toBe('Matemática');
    expect(mat.id).toBe(String(materiaId));
    expect(mat.frentes).toHaveLength(3);
    expect(mat.studentsContributing).toBe(1);
    expect(mat.attemptsContributing).toBe(3);
  });

  it('dedupe persiste mesmo quando o mesmo aluno aparece em linhas diferentes', () => {
    const materiaA = new Types.ObjectId();
    const materiaB = new Types.ObjectId();
    const u1 = new Types.ObjectId();
    const u2 = new Types.ObjectId();
    const rows = [
      {
        _id: {
          usuario: u1,
          materiaId: materiaA,
          materiaNome: 'Matemática',
          frenteId: new Types.ObjectId(),
          frenteNome: 'Aritmética',
        },
        avg: 0.9,
        attempts: 1,
      },
      {
        _id: {
          usuario: u2,
          materiaId: materiaA,
          materiaNome: 'Matemática',
          frenteId: new Types.ObjectId(),
          frenteNome: 'Aritmética',
        },
        avg: 0.7,
        attempts: 1,
      },
      {
        _id: {
          usuario: u1,
          materiaId: materiaB,
          materiaNome: 'Português',
          frenteId: new Types.ObjectId(),
          frenteNome: 'Gramática',
        },
        avg: 0.6,
        attempts: 1,
      },
    ];

    const payload = call(rows);

    expect(payload.materias).toHaveLength(2);
    const mat = payload.materias.find((m: any) => m.nome === 'Matemática')!;
    expect(mat.studentsContributing).toBe(2);
  });
});
