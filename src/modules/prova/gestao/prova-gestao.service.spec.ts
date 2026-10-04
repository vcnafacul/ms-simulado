import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Status } from '../../questao/enums/status.enum';
import {
  ProvaGestaoService,
  TEXTO_CARTAO_EMITIDO,
  TEXTO_CATEGORIA_INVALIDA,
  TEXTO_JA_FEITA_CATEGORIA,
  TEXTO_JA_FEITA_EXCLUIR,
  TEXTO_NOME_EM_USO,
} from './prova-gestao.service';

const ATOR = {
  userId: 'u1',
  cursinhoId: 'cur-A',
  admin: false,
  editorCursinho: false,
};

const CATEGORIA_DO_A = {
  _id: 'cat-a',
  dono: 'cur-A',
  selecionavel: true,
  quantidadeTotalQuestao: 45,
  exame: { nome: 'Simulado' },
};

const provaDe = (over: Record<string, unknown> = {}) => ({
  _id: 'p1',
  nome: 'Simulado de março',
  ano: 2023,
  edicao: 'Regular',
  aplicacao: 1,
  cursinhoId: 'cur-A',
  categoria: CATEGORIA_DO_A,
  questoes: [
    { numero: 1, questao: { _id: 'q1', status: Status.Approved } },
    { numero: 30, questao: { _id: 'q2', status: Status.Approved } },
  ],
  simulados: [
    {
      _id: 's1',
      descricao: 'Simulado',
      cartaoSeq: 0,
      categoria: CATEGORIA_DO_A,
      questoes: [] as unknown[],
    },
  ],
  ...over,
});

const montar = (
  over: {
    prova?: unknown;
    excluida?: boolean;
    homonima?: unknown;
    categoria?: unknown;
    historicos?: number;
  } = {},
) => {
  const provas = {
    getById: jest
      .fn()
      .mockResolvedValue(over.prova === undefined ? provaDe() : over.prova),
    estaExcluida: jest.fn().mockResolvedValue(over.excluida ?? false),
    getAtivaByNomeECursinho: jest.fn().mockResolvedValue(over.homonima ?? null),
    atualizarDados: jest.fn(),
    arquivar: jest.fn(),
  };
  const categorias = {
    getVivaById: jest.fn().mockResolvedValue(
      over.categoria === undefined
        ? {
            _id: 'cat-b',
            dono: 'cur-A',
            selecionavel: true,
            quantidadeTotalQuestao: 90,
            exame: { nome: 'ENEM' },
          }
        : over.categoria,
    ),
  };
  const simulados = {
    renomear: jest.fn(),
    updateSession: jest.fn(),
    arquivarDaProva: jest.fn(),
  };
  const historicos = {
    contarPorSimulados: jest.fn().mockResolvedValue(over.historicos ?? 0),
  };
  const auditLog = { create: jest.fn() };
  const service = new ProvaGestaoService(
    provas as any,
    categorias as any,
    simulados as any,
    historicos as any,
    auditLog as any,
  );
  return { service, provas, categorias, simulados, historicos, auditLog };
};

describe('ProvaGestaoService (card 41)', () => {
  describe('dono', () => {
    it('⚠️ prova de outro cursinho → 403; sem cursinho no ator → 403', async () => {
      const a = montar({ prova: provaDe({ cursinhoId: 'cur-B' }) });
      await expect(a.service.editar('p1', { ano: 2026 }, ATOR)).rejects.toThrow(
        ForbiddenException,
      );
      const b = montar();
      await expect(
        b.service.excluir('p1', { ...ATOR, cursinhoId: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(b.provas.arquivar).not.toHaveBeenCalled();
    });

    it('⚠️ prova da plataforma (sem cursinho) ou de categoria oficial → 403', async () => {
      const a = montar({ prova: provaDe({ cursinhoId: null }) });
      await expect(a.service.excluir('p1', ATOR)).rejects.toThrow(
        'prova oficial',
      );
      const b = montar({
        prova: provaDe({ categoria: { ...CATEGORIA_DO_A, dono: 'system' } }),
      });
      await expect(b.service.editar('p1', { ano: 2026 }, ATOR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('prova inexistente ou já excluída → 404', async () => {
      await expect(
        montar({ prova: null }).service.editar('p1', {}, ATOR),
      ).rejects.toThrow(NotFoundException);
      await expect(
        montar({ excluida: true }).service.excluir('p1', ATOR),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('editar', () => {
    it('nome, ano, edição e aplicação: $set só do que mudou, simulado renomeado, auditado', async () => {
      const m = montar();
      const r = await m.service.editar(
        'p1',
        {
          nome: ' Simulado de abril ',
          ano: 2026,
          edicao: 'Digital' as any,
          aplicacao: 1,
        },
        ATOR,
      );

      expect(r).toEqual({ nome: 'Simulado de abril' });
      expect(m.provas.atualizarDados).toHaveBeenCalledWith('p1', {
        nome: 'Simulado de abril',
        ano: 2026,
        edicao: 'Digital',
      });
      expect(m.simulados.renomear).toHaveBeenCalledWith(
        ['s1'],
        'Simulado de abril',
      );
      expect(m.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: 'u1', entityId: 'p1' }),
      );
    });

    it('⚠️ nome de OUTRA prova viva do cursinho → 409; o próprio nome não conflita', async () => {
      const a = montar({ homonima: { _id: 'p2' } });
      await expect(
        a.service.editar('p1', { nome: 'Teste' }, ATOR),
      ).rejects.toThrow(TEXTO_NOME_EM_USO);
      expect(a.provas.atualizarDados).not.toHaveBeenCalled();

      const b = montar();
      await b.service.editar('p1', { nome: 'Simulado de março' }, ATOR);
      expect(b.provas.getAtivaByNomeECursinho).not.toHaveBeenCalled();
      expect(b.provas.atualizarDados).not.toHaveBeenCalled();
    });

    it('nome vazio → 400', async () => {
      await expect(
        montar().service.editar('p1', { nome: '   ' }, ATOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('categoria: troca o total, o simulado segue (categoria, descrição, bloqueio)', async () => {
      const m = montar();
      await m.service.editar('p1', { categoria: 'cat-b' }, ATOR);

      expect(m.provas.atualizarDados).toHaveBeenCalledWith('p1', {
        categoria: 'cat-b',
        totalQuestao: 90,
      });
      const simulado = m.simulados.updateSession.mock.calls[0][0];
      expect(simulado.categoria._id).toBe('cat-b');
      expect(simulado.descricao).toBe('ENEM');
      // 0 questões de 90: bloqueado
      expect(simulado.bloqueado).toBe(true);
    });

    it.each([
      [
        'de outro cursinho',
        { _id: 'cat-x', dono: 'cur-B', selecionavel: true },
      ],
      ['fora de uso', { _id: 'cat-x', dono: 'cur-A', selecionavel: false }],
      ['inexistente', null],
    ])('⚠️ categoria %s → 400', async (_, categoria) => {
      const m = montar({ categoria });
      await expect(
        m.service.editar('p1', { categoria: 'cat-x' }, ATOR),
      ).rejects.toThrow(TEXTO_CATEGORIA_INVALIDA);
      expect(m.provas.atualizarDados).not.toHaveBeenCalled();
    });

    it('⚠️ categoria com cartão enviado → 409; com cartão gerado → 409', async () => {
      const a = montar({ historicos: 1 });
      await expect(
        a.service.editar('p1', { categoria: 'cat-b' }, ATOR),
      ).rejects.toThrow(TEXTO_JA_FEITA_CATEGORIA);

      const b = montar({
        prova: provaDe({
          simulados: [{ _id: 's1', cartaoSeq: 3, questoes: [] as unknown[] }],
        }),
      });
      await expect(
        b.service.editar('p1', { categoria: 'cat-b' }, ATOR),
      ).rejects.toThrow(TEXTO_CARTAO_EMITIDO);
      expect(b.provas.atualizarDados).not.toHaveBeenCalled();
    });

    it('⚠️ categoria menor que a numeração da prova → 409 com os números', async () => {
      const m = montar({
        categoria: {
          _id: 'cat-c',
          dono: 'cur-A',
          selecionavel: true,
          quantidadeTotalQuestao: 20,
          exame: { nome: 'X' },
        },
      });
      await expect(
        m.service.editar('p1', { categoria: 'cat-c' }, ATOR),
      ).rejects.toThrow('(30)');
      expect(m.provas.atualizarDados).not.toHaveBeenCalled();
    });

    it('trocar o ano não depende de ninguém ter feito a prova', async () => {
      const m = montar({ historicos: 5 });
      await m.service.editar('p1', { ano: 2026 }, ATOR);
      expect(m.provas.atualizarDados).toHaveBeenCalledWith('p1', { ano: 2026 });
      expect(m.historicos.contarPorSimulados).not.toHaveBeenCalled();
    });
  });

  describe('excluir', () => {
    it('arquiva a prova e o simulado, audita e devolve o nome', async () => {
      const m = montar();
      await expect(m.service.excluir('p1', ATOR)).resolves.toEqual({
        nome: 'Simulado de março',
      });
      expect(m.provas.arquivar).toHaveBeenCalledWith('p1');
      expect(m.simulados.arquivarDaProva).toHaveBeenCalledWith(['s1']);
      expect(m.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.stringContaining('"acao":"excluir"'),
        }),
      );
    });

    it('⚠️ com cartão enviado (qualquer status) → 409, nada arquivado', async () => {
      const m = montar({ historicos: 1 });
      await expect(m.service.excluir('p1', ATOR)).rejects.toThrow(
        ConflictException,
      );
      await expect(m.service.excluir('p1', ATOR)).rejects.toThrow(
        TEXTO_JA_FEITA_EXCLUIR,
      );
      expect(m.provas.arquivar).not.toHaveBeenCalled();
      expect(m.simulados.arquivarDaProva).not.toHaveBeenCalled();
    });
  });
});
