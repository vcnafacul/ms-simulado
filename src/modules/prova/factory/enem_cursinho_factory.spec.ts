import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotImplementedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  DONO_CURSINHO,
  DONO_SYSTEM,
} from 'src/modules/categoria/schemas/categoria.schema';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { Idioma } from 'src/modules/simulado/enums/idioma.enum';
import { EnemService } from '../services/enem_service';
import {
  EnemCursinhoFactory,
  simuladosDoIdioma,
} from './enem_cursinho_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';
import { ProvaFactory } from './prova_factory';

/** tickets/038, card 02 — fábrica da prova ENEM do cursinho. */

const ING = { _id: new Types.ObjectId() };
const ESP = { _id: new Types.ObjectId() };
const HIST = new Types.ObjectId().toString();
const exame = { _id: new Types.ObjectId(), nome: 'ENEM' };
const catDia = (nome: string) =>
  ({
    _id: new Types.ObjectId(),
    nome,
    dono: DONO_CURSINHO,
    custom: false,
    exame,
  }) as any;
const DIA1 = catDia(EnemArea.Enem1);
const DIA2 = catDia(EnemArea.Enem2);

const SIM_ING = { _id: 's-ing', nome: 'P Inglês', idioma: Idioma.Ingles };
const SIM_ESP = { _id: 's-esp', nome: 'P Espanhol', idioma: Idioma.Espanhol };
const SIM_D2 = { _id: 's-d2', nome: 'P', idioma: null as Idioma | null };

function make(categoria = DIA1, prova: Record<string, unknown> = {}) {
  const session = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const questaoRepository = {
    startSession: jest.fn().mockResolvedValue(session),
    create: jest.fn(async (q) => ({ ...q, _id: 'q-nova' })),
  };
  const provaRepository = {
    getAtivaByNomeECursinho: jest.fn().mockResolvedValue(null),
    getById: jest.fn().mockResolvedValue({
      _id: 'p1',
      nome: 'P',
      categoria,
      enemAreas:
        categoria === DIA1
          ? [EnemArea.Linguagens, EnemArea.CienciasHumanas]
          : [EnemArea.BioExatas, EnemArea.Matematica],
      simulados: categoria === DIA1 ? [SIM_ING, SIM_ESP] : [SIM_D2],
      questoes: [],
      ...prova,
    }),
    getProvaWithQuestion: jest.fn(),
    addQuestion: jest.fn(),
  };
  const frenteRepository = {
    getByFilter: jest.fn(async ({ nome }) =>
      nome === Idioma.Ingles ? ING : nome === Idioma.Espanhol ? ESP : null,
    ),
  };
  const simuladoService = { addQuestionSimulados: jest.fn() };
  const simuladoRepository = {
    create: jest.fn(async (s) => ({ ...s, _id: `sim-${s.nome}` })),
  };
  const factory = new EnemCursinhoFactory(
    questaoRepository as any,
    provaRepository as any,
    frenteRepository as any,
    simuladoService as any,
    simuladoRepository as any,
    new EnemService({} as any, {} as any, {} as any),
    categoria,
  );
  return {
    factory,
    session,
    questaoRepository,
    provaRepository,
    simuladoService,
    simuladoRepository,
  };
}

const item = (o: Record<string, unknown> = {}) =>
  ({
    nome: '1º Simulado',
    categoria: 'c',
    ano: 2026,
    criadorId: 'u1',
    cursinhoId: 'cur-A',
    ...o,
  }) as any;

describe('EnemCursinhoFactory.createProva', () => {
  it('Dia 1: nome digitado, 95 posições, Linguagens + Humanas, a partir do 1', async () => {
    const { factory } = make(DIA1);
    const prova = await factory.createProva(item());
    expect(prova).toMatchObject({
      nome: '1º Simulado',
      totalQuestao: 95,
      inicialNumero: 1,
      enemAreas: [EnemArea.Linguagens, EnemArea.CienciasHumanas],
      cursinhoId: 'cur-A',
    });
  });

  it('Dia 2: 90 questões, Natureza + Matemática, a partir do 91', async () => {
    const { factory } = make(DIA2);
    const prova = await factory.createProva(item());
    expect(prova).toMatchObject({
      totalQuestao: 90,
      inicialNumero: 91,
      enemAreas: [EnemArea.BioExatas, EnemArea.Matematica],
    });
  });

  it('nome repetido no mesmo cursinho → 409', async () => {
    const { factory, provaRepository } = make(DIA1);
    provaRepository.getAtivaByNomeECursinho.mockResolvedValue({ _id: 'x' });
    await expect(factory.createProva(item())).rejects.toMatchObject({
      status: 409,
    });
    expect(provaRepository.getAtivaByNomeECursinho).toHaveBeenCalledWith(
      '1º Simulado',
      'cur-A',
    );
  });

  it('sem nome → 400', async () => {
    const { factory } = make(DIA1);
    await expect(factory.createProva(item({ nome: '  ' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('categoria compartilhada que não é dia do ENEM → 400', async () => {
    const { factory } = make(catDia('Outra'));
    await expect(factory.createProva(item())).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('EnemCursinhoFactory.createSimulados', () => {
  it('Dia 1: "<nome> Inglês" e "<nome> Espanhol", com o idioma no campo', async () => {
    const { factory, simuladoRepository } = make(DIA1);
    const prova = await factory.createProva(item());
    await factory.createSimulados(prova);

    expect(simuladoRepository.create.mock.calls.map(([s]) => s)).toMatchObject([
      {
        nome: '1º Simulado Inglês',
        idioma: Idioma.Ingles,
        cursinhoId: 'cur-A',
        criadorId: 'u1',
        categoria: DIA1,
      },
      {
        nome: '1º Simulado Espanhol',
        idioma: Idioma.Espanhol,
        cursinhoId: 'cur-A',
        criadorId: 'u1',
        categoria: DIA1,
      },
    ]);
    expect(prova.simulados).toHaveLength(2);
  });

  it('Dia 2: um simulado com o nome da prova, sem idioma', async () => {
    const { factory, simuladoRepository } = make(DIA2);
    const prova = await factory.createProva(item());
    await factory.createSimulados(prova);

    expect(simuladoRepository.create.mock.calls.map(([s]) => s)).toMatchObject([
      { nome: '1º Simulado', idioma: null, cursinhoId: 'cur-A' },
    ]);
  });
});

describe('EnemCursinhoFactory.createQuestion — roteamento (R3)', () => {
  const criar = async (
    o: Record<string, unknown>,
    categoria = DIA1,
    prova: Record<string, unknown> = {},
  ) => {
    const ctx = make(categoria, prova);
    await ctx.factory.createQuestion({ prova: 'p1', ...o } as any);
    return ctx;
  };
  const destino = (ctx: ReturnType<typeof make>) =>
    ctx.simuladoService.addQuestionSimulados.mock.calls[0][0].map(
      (s: { _id: string }) => s._id,
    );

  it('Inglês no 3 → só o simulado Inglês', async () => {
    const ctx = await criar({
      numero: 3,
      frente1: ING._id.toString(),
      enemArea: EnemArea.Linguagens,
    });
    expect(destino(ctx)).toEqual(['s-ing']);
    expect(ctx.provaRepository.addQuestion).toHaveBeenCalledWith(
      'p1',
      expect.anything(),
      3,
      ctx.session,
    );
    expect(ctx.session.commitTransaction).toHaveBeenCalled();
  });

  it('Espanhol no 3 → só o simulado Espanhol', async () => {
    const ctx = await criar({
      numero: 3,
      frente1: ESP._id.toString(),
      enemArea: EnemArea.Linguagens,
    });
    expect(destino(ctx)).toEqual(['s-esp']);
  });

  it('História no 40 → os dois', async () => {
    const ctx = await criar({
      numero: 40,
      frente1: HIST,
      enemArea: EnemArea.CienciasHumanas,
    });
    expect(destino(ctx)).toEqual(['s-ing', 's-esp']);
  });

  it('Dia 2: Matemática no 150 → o único simulado', async () => {
    const ctx = await criar(
      { numero: 150, frente1: HIST, enemArea: EnemArea.Matematica },
      DIA2,
    );
    expect(destino(ctx)).toEqual(['s-d2']);
  });

  it('⚠️ o idioma vem do CAMPO, não do nome: prova "Simulado Inglês"', async () => {
    // Os dois simulados têm "Inglês" no nome; pelo nome, a de Espanhol iria
    // para o simulado Inglês também.
    const ctx = await criar(
      { numero: 2, frente1: ESP._id.toString(), enemArea: EnemArea.Linguagens },
      DIA1,
      {
        simulados: [
          {
            _id: 's-ing',
            nome: 'Simulado Inglês Inglês',
            idioma: Idioma.Ingles,
          },
          {
            _id: 's-esp',
            nome: 'Simulado Inglês Espanhol',
            idioma: Idioma.Espanhol,
          },
        ],
      },
    );
    expect(destino(ctx)).toEqual(['s-esp']);
  });
});

describe('EnemCursinhoFactory.createQuestion — recusas (antes de escrever)', () => {
  const recusa = async (
    o: Record<string, unknown>,
    categoria = DIA1,
    prova: Record<string, unknown> = {},
  ) => {
    const ctx = make(categoria, prova);
    const p = ctx.factory.createQuestion({ prova: 'p1', ...o } as any);
    await expect(p).rejects.toBeInstanceOf(HttpException);
    expect(ctx.questaoRepository.create).not.toHaveBeenCalled();
    expect(ctx.questaoRepository.startSession).not.toHaveBeenCalled();
    return p.catch((e) => e);
  };

  it('frente que não é idioma de 1 a 5', async () => {
    await recusa({ numero: 2, frente1: HIST, enemArea: EnemArea.Linguagens });
  });

  it('idioma fora de 1 a 5', async () => {
    await recusa({
      numero: 10,
      frente1: ING._id.toString(),
      enemArea: EnemArea.Linguagens,
    });
  });

  it('área de outro dia', async () => {
    const e = await recusa({
      numero: 40,
      frente1: HIST,
      enemArea: EnemArea.Matematica,
    });
    expect(e).toBeInstanceOf(BadRequestException);
  });

  it('⚠️ segunda questão do MESMO idioma no mesmo número (1 a 5)', async () => {
    const e = await recusa(
      { numero: 3, frente1: ING._id.toString(), enemArea: EnemArea.Linguagens },
      DIA1,
      { questoes: [{ numero: 3, questao: { frente1: { _id: ING._id } } }] },
    );
    expect(e).toBeInstanceOf(ConflictException);
  });

  it('o outro idioma no mesmo número entra', async () => {
    const ctx = make(DIA1, {
      questoes: [{ numero: 3, questao: { frente1: { _id: ING._id } } }],
    });
    await ctx.factory.createQuestion({
      prova: 'p1',
      numero: 3,
      frente1: ESP._id.toString(),
      enemArea: EnemArea.Linguagens,
    } as any);
    expect(ctx.questaoRepository.create).toHaveBeenCalled();
  });
});

describe('EnemCursinhoFactory — numeração', () => {
  const cheia = (de: number, ate: number, idiomas = false) => {
    const q: { numero: number }[] = [];
    for (let n = de; n <= ate; n++) {
      q.push({ numero: n });
      if (idiomas && n <= 5) q.push({ numero: n });
    }
    return q;
  };

  it('Dia 1: de 1 a 5 falta enquanto não houver as duas', async () => {
    const { factory } = make(DIA1);
    const questoes = cheia(1, 90).concat({ numero: 1 });
    expect(
      await factory.getMissingNumbers({ inicialNumero: 1, questoes } as any),
    ).toEqual([2, 3, 4, 5]);
  });

  it('Dia 1: o nome da prova não importa (a 2017+ olha "Dia 1" no nome)', async () => {
    const { factory } = make(DIA1);
    expect(
      await factory.getMissingNumbers({
        nome: 'Meu simulado',
        inicialNumero: 1,
        questoes: cheia(1, 89, true),
      } as any),
    ).toEqual([90]);
  });

  it('Dia 2: 91 a 180, um por número', async () => {
    const { factory } = make(DIA2);
    expect(
      await factory.getMissingNumbers({
        inicialNumero: 91,
        questoes: cheia(92, 180),
      } as any),
    ).toEqual([91]);
  });

  it('verifyNumberProva: duas no 3, uma no 40', async () => {
    const { factory, provaRepository } = make(DIA1);
    provaRepository.getProvaWithQuestion.mockResolvedValue({
      questoes: [{ numero: 3 }, { numero: 40 }],
    });
    expect(await factory.verifyNumberProva('p1', 3)).toBe(true);
    expect(await factory.verifyNumberProva('p1', 40)).toBe(false);
  });
});

describe('EnemCursinhoFactory — editar/vincular ficam para o card 03', () => {
  it('501 em vez de rotear errado', async () => {
    const { factory } = make(DIA1);
    await expect(factory.updateQuestion()).rejects.toThrow(
      NotImplementedException,
    );
    await expect(factory.addQuestaoExistenteAProva()).rejects.toThrow(
      NotImplementedException,
    );
  });
});

describe('simuladosDoIdioma', () => {
  it('prova sem o simulado do idioma → 409, e não "nenhum simulado" calado', () => {
    expect(() =>
      simuladosDoIdioma({ simulados: [SIM_D2] as any }, Idioma.Ingles),
    ).toThrow(ConflictException);
  });
});

describe('ProvaFactory.getFactory — compartilhada (tickets/038)', () => {
  const dispatcher = new ProvaFactory(
    ...(Array(7).fill({}) as [any, any, any, any, any, any, any]),
  );

  it('dono "Cursinho" → EnemCursinhoFactory, qualquer ano', () => {
    expect(dispatcher.getFactory(DIA1, undefined as any)).toBeInstanceOf(
      EnemCursinhoFactory,
    );
    expect(dispatcher.getFactory(DIA2, 2026)).toBeInstanceOf(
      EnemCursinhoFactory,
    );
  });

  it('a "Enem Dia 1" da plataforma segue na 2017+', () => {
    expect(
      dispatcher.getFactory({ ...DIA1, dono: DONO_SYSTEM }, 2026),
    ).toBeInstanceOf(Enem2017PlusFactory);
  });
});
