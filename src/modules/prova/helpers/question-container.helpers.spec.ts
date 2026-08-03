import { Types } from 'mongoose';
import {
  addQuestaoToContainer,
  removeQuestaoFromContainer,
  updateNumeroNoContainer,
} from './question-container.helpers';

describe('question-container.helpers', () => {
  it('addQuestaoToContainer empurra { questao, numero } com o objeto completo', () => {
    const container: any = { questoes: [] };
    const questao: any = { _id: new Types.ObjectId(), numero: 7, status: 'approved' };

    addQuestaoToContainer(container, questao);

    expect(container.questoes).toHaveLength(1);
    expect(container.questoes[0].numero).toBe(7);
    // objeto completo preservado (permite ler .status em memória)
    expect(container.questoes[0].questao).toBe(questao);
    expect(container.questoes[0].questao.status).toBe('approved');
  });

  it('permite duas questões com o mesmo numero (idiomáticas ENEM, sem dedupe)', () => {
    const container: any = { questoes: [] };
    const q1: any = { _id: new Types.ObjectId(), numero: 1 };
    const q2: any = { _id: new Types.ObjectId(), numero: 1 };

    addQuestaoToContainer(container, q1);
    addQuestaoToContainer(container, q2);

    expect(container.questoes).toHaveLength(2);
    expect(container.questoes.map((qc: any) => qc.numero)).toEqual([1, 1]);
  });

  it('removeQuestaoFromContainer remove por id quando questao é objeto completo', () => {
    const id = new Types.ObjectId();
    const outro = new Types.ObjectId();
    const container: any = {
      questoes: [
        { questao: { _id: id }, numero: 1 },
        { questao: { _id: outro }, numero: 2 },
      ],
    };

    removeQuestaoFromContainer(container, id);

    expect(container.questoes).toHaveLength(1);
    expect(container.questoes[0].questao._id).toBe(outro);
  });

  it('removeQuestaoFromContainer remove por id quando questao é ObjectId cru (ref não populada)', () => {
    const id = new Types.ObjectId();
    const outro = new Types.ObjectId();
    const container: any = {
      questoes: [
        { questao: id, numero: 1 },
        { questao: outro, numero: 2 },
      ],
    };

    removeQuestaoFromContainer(container, id);

    expect(container.questoes).toHaveLength(1);
    expect(container.questoes[0].questao).toBe(outro);
  });
});

describe('updateNumeroNoContainer', () => {
  it('atualiza o numero da entry correta e retorna true (questao objeto completo)', () => {
    const alvo = new Types.ObjectId();
    const outro = new Types.ObjectId();
    const container: any = {
      questoes: [
        { questao: { _id: alvo }, numero: 5 },
        { questao: { _id: outro }, numero: 6 },
      ],
    };

    const changed = updateNumeroNoContainer(container, alvo, 42);

    expect(changed).toBe(true);
    expect(container.questoes[0].numero).toBe(42);
    expect(container.questoes[1].numero).toBe(6);
  });

  it('funciona com questao sendo ObjectId cru (ref não populada)', () => {
    const alvo = new Types.ObjectId();
    const container: any = {
      questoes: [{ questao: alvo, numero: 5 }],
    };

    const changed = updateNumeroNoContainer(container, alvo, 9);

    expect(changed).toBe(true);
    expect(container.questoes[0].numero).toBe(9);
  });

  it('retorna false quando o numero já é o esperado (no-op)', () => {
    const alvo = new Types.ObjectId();
    const container: any = {
      questoes: [{ questao: { _id: alvo }, numero: 7 }],
    };

    const changed = updateNumeroNoContainer(container, alvo, 7);

    expect(changed).toBe(false);
    expect(container.questoes[0].numero).toBe(7);
  });

  it('retorna false quando a questão não está no container', () => {
    const container: any = {
      questoes: [{ questao: { _id: new Types.ObjectId() }, numero: 1 }],
    };

    const changed = updateNumeroNoContainer(container, new Types.ObjectId(), 3);

    expect(changed).toBe(false);
  });
});
