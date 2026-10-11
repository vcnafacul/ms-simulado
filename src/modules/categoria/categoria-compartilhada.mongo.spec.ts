import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import { Exame, ExameSchema } from '../exame/exame.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { Simulado, SimuladoSchema } from '../simulado/schemas/simulado.schema';
import { SimuladoRepository } from '../simulado/simulado.repository';
import { CategoriaRepository } from './categoria.repository';
import { CategoriaService } from './categoria.service';
import {
  Categoria,
  CategoriaSchema,
  DONO_CURSINHO,
  DONO_SYSTEM,
} from './schemas/categoria.schema';

/**
 * tickets/038, card 01 (R1) — a listagem com as compartilhadas, no Mongo real.
 *
 * ⚠️ O `$in` no filtro e o `cursinhoId` na contagem só são provados de verdade
 * contra o banco: um mock provaria apenas que passei o objeto que eu montei.
 */
describe('categorias compartilhadas "Cursinho" (tickets/038) — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let service: CategoriaService;
  const [COMPARTILHADA, DO_A, DO_B, DA_PLATAFORMA] = [0, 1, 2, 3].map(
    () => new Types.ObjectId(),
  );

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { dbName: `cat-comp-${Date.now()}` }),
        MongooseModule.forFeature([
          { name: Categoria.name, schema: CategoriaSchema },
          { name: Exame.name, schema: ExameSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Prova.name, schema: ProvaSchema },
        ]),
      ],
      providers: [
        CategoriaService,
        CategoriaRepository,
        SimuladoRepository,
        ProvaRepository,
      ],
    }).compile();
    service = mod.get(CategoriaService);

    const conn: Connection = mod.get(getConnectionToken());
    const categoria = (_id: Types.ObjectId, nome: string, dono: string) => ({
      _id,
      nome,
      dono,
      duracao: 300,
      custom: dono !== DONO_SYSTEM && dono !== DONO_CURSINHO,
      selecionavel: true,
      deleted: false,
    });
    await conn
      .collection('categorias')
      .insertMany([
        categoria(COMPARTILHADA, 'Enem Dia 1', DONO_CURSINHO),
        categoria(DO_A, 'Mini do A', 'cur-A'),
        categoria(DO_B, 'Mini do B', 'cur-B'),
        categoria(DA_PLATAFORMA, 'Enem Dia 1', DONO_SYSTEM),
      ]);

    // Provas na compartilhada: 2 do A, 3 do B.
    const provas = [...Array(2).fill('cur-A'), ...Array(3).fill('cur-B')].map(
      (cursinhoId) => ({
        categoria: COMPARTILHADA,
        cursinhoId,
        deleted: false,
      }),
    );
    await conn.collection('provas').insertMany(provas);
    await conn.collection('simulados').insertMany(provas);
  });

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const listar = (dono?: string) =>
    service
      .getAll({ page: 1, limit: 50 }, dono)
      .then((r) => r.data.map((c) => `${c.dono}:${c.nome}`).sort());

  it('o cursinho A vê as dele e a compartilhada — não as do B nem as do projeto', async () => {
    expect(await listar('cur-A')).toEqual([
      `${DONO_CURSINHO}:Enem Dia 1`,
      'cur-A:Mini do A',
    ]);
  });

  it('o cursinho B também vê a compartilhada', async () => {
    expect(await listar('cur-B')).toEqual([
      `${DONO_CURSINHO}:Enem Dia 1`,
      'cur-B:Mini do B',
    ]);
  });

  it('o projeto não vê a compartilhada', async () => {
    expect(await listar()).toEqual([`${DONO_SYSTEM}:Enem Dia 1`]);
  });

  it('⚠️ a contagem de uso da compartilhada é só do cursinho que lista', async () => {
    const doA = await service.getAll({ page: 1, limit: 50 }, 'cur-A');
    const comp = doA.data.find((c) => c.dono === DONO_CURSINHO)!;
    expect(comp.provasCount).toBe(2);
    expect(comp.simuladosCount).toBe(2);

    const doB = await service.getAll({ page: 1, limit: 50 }, 'cur-B');
    expect(doB.data.find((c) => c.dono === DONO_CURSINHO)!.provasCount).toBe(3);
  });
});
