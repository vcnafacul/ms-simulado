import { Types } from 'mongoose';
import { MotivoAnulacao } from '../enums/motivo-anulacao.enum';
import { AnulacaoRepository } from './anulacao.repository';

/**
 * tickets/042, card 01 — container e espelho nunca divergem: TODA escrita usa a
 * sessão de quem chamou, e um erro no meio sobe (para a transação abortar).
 *
 * ⚠️ Sem Mongo: o `MongoMemoryReplSet` não passa do handshake neste ambiente
 * (ver `prova.aplicar-versao.mongo.spec.ts`), então o "abortou e nada ficou" é
 * do Mongo; o que é nosso é passar a sessão a tudo e não engolir o erro.
 */
describe('AnulacaoRepository — sessão', () => {
  const P = new Types.ObjectId();
  const Q = new Types.ObjectId();
  const S = new Types.ObjectId();
  const session = { id: 'sessao' } as never;
  const exec = <T>(v: T) => ({ exec: jest.fn().mockResolvedValue(v) });
  const lean = <T>(v: T) => ({ lean: () => exec(v) });

  function montar(falharNoEspelho = false) {
    const provaModel = {
      findById: jest.fn(() =>
        lean({ questoes: [{ questao: Q, numero: 45 }], simulados: [S] }),
      ),
      updateOne: jest.fn(() => exec({})),
    };
    const simuladoModel = {
      find: jest.fn(() => lean([{ _id: S }])),
      updateOne: jest.fn(() => exec({})),
    };
    const questaoModel = {
      updateOne: jest.fn((_f: unknown, u: Record<string, unknown>) =>
        falharNoEspelho && u.$push
          ? { exec: jest.fn().mockRejectedValue(new Error('caiu')) }
          : exec({}),
      ),
    };
    const repo = new AnulacaoRepository(
      provaModel as never,
      simuladoModel as never,
      questaoModel as never,
    );
    return { repo, provaModel, simuladoModel, questaoModel };
  }

  const anulacao = {
    motivo: MotivoAnulacao.outro,
    justificativa: 'Justificativa longa.',
    em: new Date(),
    porUsuarioId: 'u',
    porCursinhoId: null as string | null,
  };

  it('toda leitura e escrita recebe a mesma sessão', async () => {
    const m = montar();
    await m.repo.gravar(
      { provaId: String(P), questaoId: String(Q), subirRevisao: true, session },
      anulacao,
    );
    const chamadas = [
      ...m.provaModel.findById.mock.calls.map((c: unknown[]) => c[2]),
      ...m.provaModel.updateOne.mock.calls.map((c: unknown[]) => c[2]),
      ...m.simuladoModel.find.mock.calls.map((c: unknown[]) => c[2]),
      ...m.simuladoModel.updateOne.mock.calls.map((c: unknown[]) => c[2]),
      ...m.questaoModel.updateOne.mock.calls.map((c: unknown[]) => c[2]),
    ] as { session?: unknown }[];
    expect(chamadas).toHaveLength(6);
    for (const opcoes of chamadas) expect(opcoes.session).toBe(session);
  });

  it('erro no espelho sobe — quem chama aborta a transação', async () => {
    const m = montar(true);
    await expect(
      m.repo.gravar(
        {
          provaId: String(P),
          questaoId: String(Q),
          subirRevisao: true,
          session,
        },
        anulacao,
      ),
    ).rejects.toThrow('caiu');
  });
});
