import mongoose from 'mongoose';
import { Prova, ProvaSchema } from './prova.schema';
import { CreateProvaDTOInput } from './dtos/create.dto.input';
import { Categoria } from '../categoria/schemas/categoria.schema';

describe('Prova schema — criadorId / cursinhoId', () => {
  const categoria = { nome: 'Enem Dia 1' } as unknown as Categoria;

  it('constructor seta criadorId a partir do item e cursinhoId = null', () => {
    const item = {
      criadorId: 'user-1',
      ano: 2023,
      filename: 'f.pdf',
    } as unknown as CreateProvaDTOInput;

    const prova = new Prova(item, categoria);

    expect(prova.criadorId).toBe('user-1');
    expect(prova.cursinhoId).toBeNull();
  });

  it('constructor lê cursinhoId do item quando presente', () => {
    const item = {
      criadorId: 'user-1',
      cursinhoId: 'curs-1',
      ano: 2023,
      filename: 'f.pdf',
    } as unknown as CreateProvaDTOInput;

    const prova = new Prova(item, categoria);

    expect(prova.cursinhoId).toBe('curs-1');
  });

  describe('validação do schema Mongoose', () => {
    let Model: mongoose.Model<Prova>;

    beforeAll(() => {
      Model = mongoose.model<Prova>('ProvaCard01Spec', ProvaSchema);
    });

    it('rejeita documento sem criadorId (required)', async () => {
      const doc = new Model({ ano: 2023 });

      const err = await doc.validate().catch((e) => e);

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.criadorId).toBeDefined();
    });

    it('aceita documento com criadorId e aplica default cursinhoId = null', async () => {
      const doc = new Model({ criadorId: 'system' });

      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.cursinhoId).toBeNull();
    });
  });
});

describe('ProvaSchema — índices', () => {
  it('declara índice em cursinhoId', () => {
    const indexes = ProvaSchema.indexes();
    const hasCursinhoIndex = indexes.some(
      ([fields]) => (fields as Record<string, number>).cursinhoId === 1,
    );
    expect(hasCursinhoIndex).toBe(true);
  });
});
