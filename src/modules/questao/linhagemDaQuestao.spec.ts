import { TipoOrigem } from './enums/tipo-origem.enum';
import {
  cadeiaDeVersoes,
  NoDaLinhagem,
  resumoDoEnunciado,
} from './linhagemDaQuestao';

const no = (id: string, over: Partial<NoDaLinhagem> = {}): NoDaLinhagem => ({
  _id: id,
  status: 0,
  congelada: false,
  origem: null,
  tipoOrigem: null,
  textoQuestao: `texto ${id}`,
  ...over,
});

/** v1 → v2 → v3, e uma cópia de v2 que NÃO é da cadeia. */
const banco: Record<string, NoDaLinhagem> = {
  v1: no('v1', { congelada: true }),
  v2: no('v2', {
    congelada: true,
    origem: 'v1',
    tipoOrigem: TipoOrigem.versao,
  }),
  v3: no('v3', { origem: 'v2', tipoOrigem: TipoOrigem.versao }),
  c1: no('c1', { origem: 'v2', tipoOrigem: TipoOrigem.copia }),
};

const buscarNo = async (id: string) => banco[id] ?? null;
const buscarSucessora = async (id: string) =>
  Object.values(banco).find(
    (q) => q.origem === id && q.tipoOrigem === TipoOrigem.versao,
  ) ?? null;

const ids = (ns: NoDaLinhagem[]) => ns.map((n) => n._id);

describe('cadeiaDeVersoes (card 34A)', () => {
  it('⚠️ a cadeia inteira é vista de QUALQUER versão', async () => {
    for (const de of ['v1', 'v2', 'v3']) {
      expect(
        ids(await cadeiaDeVersoes(banco[de], buscarNo, buscarSucessora)),
      ).toEqual(['v1', 'v2', 'v3']);
    }
  });

  it('⚠️ cópia NÃO entra na cadeia de versões', async () => {
    // A cópia de v2 é irmã: a cadeia dela é só ela.
    expect(
      ids(await cadeiaDeVersoes(banco.c1, buscarNo, buscarSucessora)),
    ).toEqual(['c1']);
  });

  it('⚠️ origem sem tipo (anterior ao card 32) é cópia — não sobe', async () => {
    const legado = no('x', { origem: 'v1' });

    expect(
      ids(await cadeiaDeVersoes(legado, buscarNo, buscarSucessora)),
    ).toEqual(['x']);
  });

  it('⚠️ um ciclo no dado não trava a consulta', async () => {
    const a = no('a', { origem: 'b', tipoOrigem: TipoOrigem.versao });
    const b = no('b', { origem: 'a', tipoOrigem: TipoOrigem.versao });
    const ciclo: Record<string, NoDaLinhagem> = { a, b };

    const cadeia = await cadeiaDeVersoes(
      a,
      async (id) => ciclo[id] ?? null,
      async (id) => Object.values(ciclo).find((q) => q.origem === id) ?? null,
    );

    expect(ids(cadeia).sort()).toEqual(['a', 'b']);
  });

  it('antecessora que sumiu encerra a subida sem erro', async () => {
    const orfa = no('v9', { origem: 'sumiu', tipoOrigem: TipoOrigem.versao });

    expect(
      ids(await cadeiaDeVersoes(orfa, buscarNo, async () => null)),
    ).toEqual(['v9']);
  });
});

describe('resumoDoEnunciado (card 34A)', () => {
  it('curto fica inteiro', () => {
    expect(resumoDoEnunciado('Quanto é 2 + 2?')).toBe('Quanto é 2 + 2?');
  });

  it('⚠️ trunca no SERVIDOR — N cópias não carregam N enunciados inteiros', () => {
    const r = resumoDoEnunciado('a'.repeat(500));

    expect(r.length).toBeLessThanOrEqual(121);
    expect(r.endsWith('…')).toBe(true);
  });

  it('junta quebras de linha e espaços — é uma linha de lista', () => {
    expect(resumoDoEnunciado('um\n\n  dois\t\ttres')).toBe('um dois tres');
  });

  it('enunciado ausente vira vazio', () => {
    expect(resumoDoEnunciado(undefined)).toBe('');
  });
});
