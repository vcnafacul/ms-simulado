import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Historico, HistoricoSchema } from '../historico/historico.schema';
import { RelatorioSimuladoEstudanteRepository } from './relatorio-simulado-estudante.repository';
import {
  RelatorioSimuladoEstudante,
  RelatorioSimuladoEstudanteSchema,
} from './relatorio-simulado-estudante.schema';

const SIM_A = new Types.ObjectId();
const SIM_B = new Types.ObjectId();

describe('RelatorioSimuladoEstudante — isolamento (Mongo real em memória)', () => {
  let mongo: MongoMemoryServer;
  let repo: RelatorioSimuladoEstudanteRepository;
  let relModel: Model<RelatorioSimuladoEstudante>;
  let histModel: Model<Historico>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([
          {
            name: RelatorioSimuladoEstudante.name,
            schema: RelatorioSimuladoEstudanteSchema,
          },
          { name: Historico.name, schema: HistoricoSchema },
        ]),
      ],
      providers: [RelatorioSimuladoEstudanteRepository],
    }).compile();

    repo = mod.get(RelatorioSimuladoEstudanteRepository);
    relModel = mod.get(getModelToken(RelatorioSimuladoEstudante.name));
    histModel = mod.get(getModelToken(Historico.name));

    const semear = async (
      simulado: Types.ObjectId,
      cursinhoId: string,
      usuario: string,
      turmaId?: string,
    ) => {
      const h = await histModel.create({
        usuario,
        simulado,
        status: 'completed',
        questoesRespondidas: 90,
        aproveitamento: { geral: 0.5, materias: [] },
      });
      await relModel.create({
        historico: h._id,
        simulado,
        usuario,
        cursinhoId,
        turmaId,
      });
    };

    await semear(SIM_A, 'cur-1', 'u-a1', 't-1');
    await semear(SIM_A, 'cur-1', 'u-a2', 't-2');
    await semear(SIM_A, 'cur-1', 'u-a3'); // sem turma
    await semear(SIM_A, 'cur-2', 'u-b1', 't-9'); // outro cursinho
    await semear(SIM_B, 'cur-1', 'u-c1', 't-1'); // outro simulado
  }, 120_000);

  afterAll(async () => {
    await mongo.stop();
  });

  it('não vaza entre cursinhos', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario).sort()).toEqual(['u-a1', 'u-a2', 'u-a3']);
  });

  it('não vaza entre simulados', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_B.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-c1']);
  });

  it('turmaId restringe à turma', async () => {
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r.map((l) => l.usuario)).toEqual(['u-a1']);
  });

  it('sem turmaId, o aluno SEM turma vem junto', async () => {
    // a prova de que `{turmaId: undefined}` não virou filtro
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
    });
    expect(r.some((l) => l.turmaId === undefined)).toBe(true);
  });

  it('o populate traz o histórico, com os campos certos e sem as respostas', async () => {
    // o `select` é uma string: um typo nele passa em todo teste com dublê
    const r = await repo.buscarPorRecorte({
      simuladoId: SIM_A.toString(),
      cursinhoId: 'cur-1',
      turmaId: 't-1',
    });
    expect(r[0].historico.status).toBe('completed');
    expect(r[0].historico.questoesRespondidas).toBe(90);
    expect(r[0].historico.aproveitamento.geral).toBe(0.5);
    expect((r[0].historico as any).respostas).toBeUndefined();
  });

  it('a contagem é do cursinho, não global', async () => {
    // cur-2 também tem cartão em SIM_A; ele não pode entrar na conta
    const total = await repo.contarDoCursinho(SIM_A.toString(), 'cur-1');
    expect(total).toBe(3);
  });
});
