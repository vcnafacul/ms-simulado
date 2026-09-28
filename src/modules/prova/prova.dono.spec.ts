import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { Ator } from 'src/shared/ator/ator';
import {
  Categoria,
  CategoriaSchema,
  DONO_SYSTEM,
} from '../categoria/schemas/categoria.schema';
import { CategoriaRepository } from '../categoria/categoria.repository';
import { Prova, ProvaSchema } from './prova.schema';
import { ProvaRepository } from './prova.repository';
import { ProvaService } from './prova.service';

/**
 * tickets/023, card 03 — o `assertPodeComporProva` contra o Mongo real.
 *
 * ⚠️ O que só o banco prova: a categoria chega **populada** (dono e
 * selecionável), e a prova legada — gravada antes do campo `cursinhoId`
 * existir — conta como da plataforma.
 */
describe('assertPodeComporProva — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let provas: Model<Prova>;
  let categorias: Model<Categoria>;
  let service: ProvaService;

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Categoria.name, schema: CategoriaSchema },
        ]),
      ],
      providers: [ProvaRepository],
    }).compile();
    provas = mod.get(getModelToken(Prova.name));
    categorias = mod.get(getModelToken(Categoria.name));
    service = new ProvaService(
      {} as never,
      mod.get(ProvaRepository),
      {} as never,
      {} as never,
      {} as never,
    );
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  const cat = async (dono: string, selecionavel = true) =>
    (
      await categorias.collection.insertOne({
        nome: `cat ${new Types.ObjectId()}`,
        dono,
        selecionavel,
      } as never)
    ).insertedId;

  /** Grava cru: `cursinhoId` só entra se vier (a legada não tem o campo). */
  const prova = async (categoria: unknown, extra: object = {}) =>
    (
      await provas.collection.insertOne({
        nome: 'P',
        categoria,
        questoes: [],
        simulados: [],
        ...extra,
      } as never)
    ).insertedId.toString();

  const ator = (o: Partial<Ator>): Ator => ({
    userId: 'u',
    cursinhoId: null,
    admin: false,
    editorCursinho: false,
    ...o,
  });

  it('dono do cursinho na própria prova, categoria própria → ok', async () => {
    const id = await prova(await cat('A'), { cursinhoId: 'A' });
    await expect(
      service.assertPodeComporProva(
        id,
        ator({ cursinhoId: 'A', editorCursinho: true }),
      ),
    ).resolves.toBeUndefined();
  });

  it('⚠️ categoria populada: selecionável=false protege até do dono', async () => {
    const id = await prova(await cat('A', false), { cursinhoId: 'A' });
    await expect(
      service.assertPodeComporProva(
        id,
        ator({ cursinhoId: 'A', editorCursinho: true }),
      ),
    ).rejects.toThrow('prova oficial');
  });

  it('⚠️ prova legada SEM o campo cursinhoId é da plataforma', async () => {
    const id = await prova(await cat(DONO_SYSTEM));
    await expect(
      service.assertPodeComporProva(id, ator({ admin: true })),
    ).resolves.toBeUndefined();
    await expect(
      service.assertPodeComporProva(
        id,
        ator({ cursinhoId: 'A', editorCursinho: true }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('outro cursinho → 403 com a mensagem', async () => {
    const id = await prova(await cat('A'), { cursinhoId: 'A' });
    await expect(
      service.assertPodeComporProva(
        id,
        ator({ cursinhoId: 'B', editorCursinho: true }),
      ),
    ).rejects.toThrow('pertence a outro cursinho');
  });

  it('prova inexistente → 404', async () => {
    await expect(
      service.assertPodeComporProva(
        new Types.ObjectId().toString(),
        ator({ admin: true }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('⚠️ 023 · 04: categoria soft-deleted não serve para criar prova', async () => {
    const repo = new CategoriaRepository(categorias as never);
    const viva = await cat('A');
    const morta = (
      await categorias.collection.insertOne({
        nome: `morta ${new Types.ObjectId()}`,
        dono: 'A',
        selecionavel: true,
        deleted: true,
      } as never)
    ).insertedId;
    expect(await repo.getVivaById(viva.toString())).not.toBeNull();
    expect(await repo.getVivaById(morta.toString())).toBeNull();
  });

  describe('receberNovasVersoes (023 · 05)', () => {
    it('prova nova nasce false; com true, true', async () => {
      const categoria = await categorias.findById(await cat('A'));
      const nova = await provas.create(
        new Prova({ criadorId: 'u' } as never, categoria as never),
      );
      expect(nova.receberNovasVersoes).toBe(false);
      const marcada = await provas.create(
        new Prova(
          { criadorId: 'u', receberNovasVersoes: true } as never,
          categoria as never,
        ),
      );
      expect(marcada.receberNovasVersoes).toBe(true);
    });

    it('⚠️ por que a migração 0004 vem antes: sem o campo, o Mongoose LÊ false', async () => {
      const id = await prova(await cat(DONO_SYSTEM)); // gravada crua, sem o campo
      expect((await provas.findById(id))!.receberNovasVersoes).toBe(false);
      // e o filtro no banco não vê o default (card 06)
      expect(
        await provas.countDocuments({ _id: id, receberNovasVersoes: true }),
      ).toBe(0);
    });

    it('o dono troca; grava com $set e o log leva de → para', async () => {
      const id = await prova(await cat('A'), {
        cursinhoId: 'A',
        receberNovasVersoes: false,
      });
      const auditLog = { create: jest.fn() };
      const comLog = new ProvaService(
        {} as never,
        mod.get(ProvaRepository),
        {} as never,
        {} as never,
        {} as never,
        auditLog as never,
      );
      const dono = ator({ cursinhoId: 'A', editorCursinho: true });
      await expect(
        comLog.alterarReceberNovasVersoes(id, true, dono),
      ).resolves.toEqual({ receberNovasVersoes: true });
      expect((await provas.findById(id))!.receberNovasVersoes).toBe(true);
      expect(
        JSON.parse(auditLog.create.mock.calls[0][0].changes),
      ).toMatchObject({
        acao: 'receberNovasVersoes',
        de: false,
        para: true,
        cursinhoId: 'A',
      });
    });

    it('outro cursinho e admin em prova de cursinho → 403, nada muda', async () => {
      const id = await prova(await cat('A'), {
        cursinhoId: 'A',
        receberNovasVersoes: false,
      });
      for (const quem of [
        ator({ cursinhoId: 'B', editorCursinho: true }),
        ator({ admin: true }),
      ]) {
        await expect(
          service.alterarReceberNovasVersoes(id, true, quem),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect((await provas.findById(id))!.receberNovasVersoes).toBe(false);
    });
  });
});
