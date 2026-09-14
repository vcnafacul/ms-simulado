import { model } from 'mongoose';
import { Categoria, CategoriaSchema, DONO_SYSTEM } from './categoria.schema';

/**
 * ⚠️ `model(...).hydrate(...)` casta OFFLINE — sem banco. É o que permite
 * testar default e índice no CI, que não sobe Mongo.
 */
const CategoriaModel = model<Categoria>('CategoriaSchemaSpec', CategoriaSchema);

describe('CategoriaSchema — dono', () => {
  it('o default do dono é a sentinela do sistema', () => {
    const doc = new CategoriaModel({ nome: 'X 10q 30min', duracao: 30 });
    expect(doc.dono).toBe(DONO_SYSTEM);
    expect(DONO_SYSTEM).toBe('system');
  });

  it('aceita um cursinhoId como dono', () => {
    const doc = new CategoriaModel({ nome: 'Enem Dia 1', dono: 'cur-1' });
    expect(doc.dono).toBe('cur-1');
  });

  it('o unique global de nome NÃO existe mais', () => {
    /**
     * ⚠️ É o coração da feature. Com `nome` unique global, o cursinho A não
     * consegue criar "Enem Dia 1" — e o código novo estaria todo certo, com
     * o servidor barrando por um índice que ninguém está mais olhando.
     */
    const nomeSozinho = CategoriaSchema.indexes().find(
      ([chaves]) => Object.keys(chaves).length === 1 && chaves.nome === 1,
    );
    expect(nomeSozinho).toBeUndefined();
    expect(CategoriaSchema.path('nome').options.unique).toBeFalsy();
  });

  it('o índice único é composto por dono+nome, e ignora os excluídos', () => {
    const [chaves, opcoes] = CategoriaSchema.indexes().find(
      ([, o]) => o?.name === 'dono_nome_unico',
    )!;

    expect(chaves).toEqual({ dono: 1, nome: 1 });
    /**
     * ⚠️ **A ordem das chaves, explicitamente.** `toEqual` compara objeto sem
     * olhar ordem, então sozinho ele deixa passar `{ nome, dono }` — provado
     * por mutação. E a ordem importa: só o prefixo `dono` serve a consulta do
     * `getAll` filtrando por dono sozinho. Invertido, aquela listagem vira
     * varredura de coleção — sem erro, só mais lenta.
     */
    expect(Object.keys(chaves)).toEqual(['dono', 'nome']);
    expect(opcoes.unique).toBe(true);
    /**
     * ⚠️ Sem o parcial, o soft delete queima o nome PARA SEMPRE: o documento
     * excluído continua ocupando a chave única e o cursinho não recria uma
     * categoria que ele mesmo apagou.
     *
     * ⚠️ `{ deleted: false }` e não `{ deleted: { $ne: true } }` — o Mongo NÃO
     * aceita `$ne` em partialFilterExpression. Funciona porque `deleted` tem
     * `default: false` no BaseSchema; a migração faz o backfill dos antigos.
     */
    expect(opcoes.partialFilterExpression).toEqual({ deleted: false });
  });

  it('o índice tem nome explícito', () => {
    // ⚠️ Dois index() sobre chaves parecidas pedem nomes derivados iguais e o
    // servidor recusa o segundo com IndexKeySpecsConflict — com autoIndex, a
    // aplicação sobe em silêncio SEM o índice. Já aconteceu neste repo.
    const semNome = CategoriaSchema.indexes().filter(([, o]) => !o?.name);
    expect(semNome).toEqual([]);
  });
});
