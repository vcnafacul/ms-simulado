import { repatriarQuestao } from './repatriador';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const GIF = Buffer.from('GIF89a-resto');
const URL_A = 'https://enem.dev/a.png';

const montar = (over: any = {}) => {
  const eventos: string[] = [];
  const buscar =
    over.buscar ??
    jest.fn(async () => {
      eventos.push('buscar');
      return { ok: true as const, buffer: PNG };
    });
  const storage = {
    existe: over.existe ?? jest.fn(async () => (eventos.push('existe'), false)),
    gravar: over.gravar ?? jest.fn(async () => void eventos.push('gravar')),
  };
  const repositorio = {
    atualizarCampos:
      over.atualizarCampos ??
      jest.fn(async () => void eventos.push('atualizar')),
  };
  const reversao = {
    registrar: jest.fn(async () => void eventos.push('reversao')),
  };
  return { buscar, storage, repositorio, reversao, eventos };
};

const questao = (over: any = {}) => ({
  _id: 'q1',
  textoQuestao: `![](${URL_A})`,
  ...over,
});

describe('repatriarQuestao — a ordem de escrita', () => {
  it('grava a imagem ANTES de tocar na questão', async () => {
    // ⚠️ É a regra do card. Uma questão apontando para uma key que não existe
    // é pior que a URL externa: a imagem some, e some em silêncio.
    const d = montar();
    await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.eventos).toEqual([
      'buscar',
      'existe',
      'gravar',
      'reversao',
      'atualizar',
    ]);
  });

  it('a reversão é registrada ANTES da escrita', async () => {
    const d = montar();
    await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.eventos.indexOf('reversao')).toBeLessThan(
      d.eventos.indexOf('atualizar'),
    );
    expect(d.reversao.registrar).toHaveBeenCalledWith({
      questaoId: 'q1',
      campo: 'textoQuestao',
      original: `![](${URL_A})`,
    });
  });

  it('falha ao gravar no R2 → a questão NÃO é tocada', async () => {
    const d = montar({
      gravar: jest.fn(async () => {
        throw new Error('R2 fora do ar');
      }),
    });
    const r = await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.repositorio.atualizarCampos).not.toHaveBeenCalled();
    expect(d.reversao.registrar).not.toHaveBeenCalled();
    expect(r.falhas[0]).toEqual({
      questaoId: 'q1',
      url: URL_A,
      motivo: 'falha ao gravar no R2',
    });
  });

  it('falha na busca → a questão NÃO é tocada', async () => {
    const d = montar({
      buscar: jest.fn(async () => ({
        ok: false as const,
        motivo: 'endereço de imagem recusado',
      })),
    });
    const r = await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.storage.gravar).not.toHaveBeenCalled();
    expect(d.repositorio.atualizarCampos).not.toHaveBeenCalled();
    // O motivo do buscador atravessa: o relatório precisa distinguir
    // "recusado" de "não baixou".
    expect(r.falhas[0].motivo).toBe('endereço de imagem recusado');
  });

  it('formato não suportado → a questão NÃO é tocada', async () => {
    // pdflatex não inclui GIF. Repatriar não conserta isso — só moveria o
    // problema para dentro do nosso bucket.
    const d = montar({
      buscar: jest.fn(async () => ({ ok: true as const, buffer: GIF })),
    });
    const r = await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.storage.gravar).not.toHaveBeenCalled();
    expect(r.falhas[0].motivo).toBe('formato não suportado');
  });
});

describe('repatriarQuestao — retomada', () => {
  it('objeto já no R2 → não rebaixa, e atualiza o Mongo', async () => {
    // ⚠️ É o caso de uma corrida anterior que gravou a imagem e falhou ao
    // gravar a questão. A chave determinística é o que torna isto possível.
    const d = montar({ existe: jest.fn(async () => true) });
    await repatriarQuestao(questao(), d as any, { dryRun: false });
    expect(d.storage.gravar).not.toHaveBeenCalled();
    expect(d.repositorio.atualizarCampos).toHaveBeenCalled();
  });

  it('questão já repatriada é ignorada por completo', async () => {
    const d = montar();
    const r = await repatriarQuestao(
      questao({ textoQuestao: '![](asset://assets/K.png)' }),
      d as any,
      { dryRun: false },
    );
    expect(d.eventos).toEqual([]);
    expect(r.questoesAlteradas).toBe(0);
  });
});

describe('repatriarQuestao — dryRun', () => {
  it('não busca, não grava e não atualiza', async () => {
    // ⚠️ Nem baixa: 64 MB de download não acrescentam informação que o
    // relatório não dê.
    const d = montar();
    const r = await repatriarQuestao(questao(), d as any, { dryRun: true });
    expect(d.eventos).toEqual([]);
    expect(r.questoesAlteradas).toBe(1); // conta o que FARIA
  });
});

describe('repatriarQuestao — vários campos e URLs', () => {
  it('a mesma URL em dois campos: um download, duas substituições', async () => {
    const d = montar();
    await repatriarQuestao(questao({ pergunta: `![](${URL_A})` }), d as any, {
      dryRun: false,
    });
    expect(d.buscar).toHaveBeenCalledTimes(1);
    const campos = d.repositorio.atualizarCampos.mock.calls[0][1];
    expect(Object.keys(campos).sort()).toEqual(['pergunta', 'textoQuestao']);
  });

  it('atualiza SÓ os campos que mudaram', async () => {
    // ⚠️ Nunca via `updateContent`: ele escreve também `alternativa`, que tem
    // `select: false` — um read-modify-write não consegue preservar o que não lê.
    const d = montar();
    await repatriarQuestao(
      questao({ textoAlternativaA: 'texto sem imagem' }),
      d as any,
      { dryRun: false },
    );
    const campos = d.repositorio.atualizarCampos.mock.calls[0][1];
    expect(Object.keys(campos)).toEqual(['textoQuestao']);
    expect(campos).not.toHaveProperty('alternativa');
  });

  it('uma URL falha e outra passa: grava a que deu certo', async () => {
    const URL_B = 'https://enem.dev/b.png';
    const buscar = jest.fn(async (url: string) =>
      url === URL_B
        ? { ok: false as const, motivo: 'imagem não pôde ser baixada' }
        : { ok: true as const, buffer: PNG },
    );
    const d = montar({ buscar });
    const r = await repatriarQuestao(
      questao({ pergunta: `![](${URL_B})` }),
      d as any,
      { dryRun: false },
    );
    const campos = d.repositorio.atualizarCampos.mock.calls[0][1];
    expect(Object.keys(campos)).toEqual(['textoQuestao']);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].url).toBe(URL_B);
  });
});
