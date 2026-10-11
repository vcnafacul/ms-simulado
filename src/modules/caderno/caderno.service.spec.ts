import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import JSZip from 'jszip';
import { CadernoService } from './caderno.service';

const simuladoPronto = (over: any = {}) => ({
  _id: 'sim1',
  nome: 'Simulado de Novembro',
  bloqueado: false,
  categoria: { nome: 'ENEM', duracao: 300, quantidadeTotalQuestao: 1 },
  questoes: [
    {
      numero: 1,
      questao: {
        status: 1,
        textoQuestao: 'E',
        pergunta: 'P',
        textoAlternativaA: 'a',
      },
    },
  ],
  ...over,
});

const montar = (over: any = {}) => {
  const simuladoService = {
    getById: jest.fn(async () => over.simulado ?? simuladoPronto()),
  };
  const resolver = {
    resolver: jest.fn(
      async () =>
        over.resolucao ?? {
          arquivos: [],
          avisos: [],
          metricas: {
            doCache: 0,
            doBucket: 0,
            daInternet: 0,
            falhas: 0,
            bytes: 0,
            ms: 0,
          },
        },
    ),
  };
  const env = { get: jest.fn(() => over.draftEnabled ?? true) };
  const templateService = {
    publicada: jest.fn(
      async () =>
        over.template ?? {
          versao: 7,
          arquivos: {
            'main.tex': '\\documentclass{exam}\n',
            'preambulo.tex': '\\usepackage{amsmath}\n',
          },
        },
    ),
  };
  const provas = { getById: jest.fn(async () => over.prova ?? null) };
  const service = new CadernoService(
    simuladoService as any,
    resolver as any,
    env as any,
    templateService as any,
    provas as any,
  );
  return { service, simuladoService, resolver, env, templateService, provas };
};

describe('CadernoService — o portão', () => {
  it('simulado inexistente → 404', async () => {
    const { service, simuladoService } = montar();
    simuladoService.getById = jest.fn(async () => null);
    await expect(service.gerarZip('sumiu', { draft: false })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('bloqueado sem draft → 409, com a mesma mensagem do cartão', async () => {
    // A mensagem é a mesma do TemplateProvisionService de propósito: duas
    // features que recusam pelo mesmo motivo não podem dizer coisas
    // diferentes.
    const { service } = montar({
      simulado: simuladoPronto({ bloqueado: true }),
    });
    await expect(service.gerarZip('sim1', { draft: false })).rejects.toThrow(
      new ConflictException(
        'simulado não está pronto (questões pendentes ou incompletas)',
      ),
    );
  });

  it('bloqueado COM draft e flag ligada → gera', async () => {
    const { service } = montar({
      simulado: simuladoPronto({ bloqueado: true }),
    });
    const r = await service.gerarZip('sim1', { draft: true });
    expect(r.buffer.length).toBeGreaterThan(0);
  });

  it('draft com a flag desligada → 403, mesmo com o simulado pronto', async () => {
    // Rascunho é ferramenta de quem monta a prova. Liberar isso por acidente
    // em produção entregaria caderno de simulado incompleto.
    const { service } = montar({ draftEnabled: false });
    await expect(service.gerarZip('sim1', { draft: true })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('desbloqueado → gera, sem olhar mais nada', async () => {
    const { service } = montar();
    const r = await service.gerarZip('sim1', { draft: false });
    expect(r.nome).toMatch(/^simulado-de-novembro-\d{8}-\d{4}\.zip$/);
  });

  it('simulado desbloqueado e SEM questão elegível → gera, não lança', async () => {
    // ⚠️ O card original pedia 422 aqui. Saiu: o endpoint tem UM portão, e é
    // `bloqueado`. Quem decide se um simulado está pronto é o fluxo que
    // CALCULA `bloqueado` — auditar isso aqui seria o caderno fiscalizando
    // trabalho alheio. O card 02 emite a questão-marcador e o zip compila.
    const { service } = montar({
      simulado: simuladoPronto({
        questoes: [],
        categoria: {
          nome: 'Custom',
          duracao: 60,
          quantidadeTotalQuestao: null,
        },
      }),
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(await zip.file('conteudo.tex')!.async('string')).toContain(
      'nenhuma questão elegível',
    );
  });

  it('resolver lançando por QUESTAO_BUCKET ausente → 503', async () => {
    const { service, resolver } = montar();
    resolver.resolver = jest.fn(async () => {
      throw new Error(
        'QUESTAO_BUCKET não configurado: não dá para ler imagens',
      );
    });
    await expect(service.gerarZip('sim1', { draft: false })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('CadernoService — o que ele repassa', () => {
  it('repassa o draft ao gerador: rascunho liga a marca d’água', async () => {
    const { service } = montar({
      simulado: simuladoPronto({ bloqueado: true }),
    });
    const r = await service.gerarZip('sim1', { draft: true });
    const zip = await JSZip.loadAsync(r.buffer);
    // ⚠️ `\cadernoRascunhotrue`, não `\def`: é um `\newif` do preambulo.tex, e
    // um `\def` não liga a marca d'água nem dá erro.
    expect(await zip.file('metadados.tex')!.async('string')).toContain(
      '\\cadernoRascunhotrue',
    );
  });

  it('no modo normal não há marca d’água', async () => {
    const { service } = montar();
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(await zip.file('metadados.tex')!.async('string')).not.toContain(
      'cadernoRascunho',
    );
  });

  it('junta os avisos dos dois cards e conta o total', async () => {
    const { service } = montar({
      simulado: simuladoPronto({
        questoes: [
          {
            numero: 1,
            questao: { status: 1, textoQuestao: 'E', pergunta: 'P' },
          },
        ],
      }),
      resolucao: {
        arquivos: [],
        avisos: ['assets/01 — imagem não encontrada no acervo'],
        metricas: {
          doCache: 0,
          doBucket: 0,
          daInternet: 0,
          falhas: 1,
          bytes: 0,
          ms: 0,
        },
      },
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');
    const linhas = conteudo.split('\n').filter((l) => l.startsWith('% AVISO:'));

    // 5 alternativas em branco (card 02) + 1 imagem (card 03) + 2 logos (card 13)
    expect(linhas.length).toBe(r.avisos);
    expect(conteudo).toContain(
      '% AVISO: assets/01 — imagem não encontrada no acervo',
    );
  });

  it('as imagens resolvidas entram no zip', async () => {
    const { service } = montar({
      resolucao: {
        arquivos: [{ nome: 'assets/01.png', buffer: Buffer.from([1, 2, 3]) }],
        avisos: [],
        metricas: {
          doCache: 0,
          doBucket: 0,
          daInternet: 1,
          falhas: 0,
          bytes: 3,
          ms: 5,
        },
      },
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(zip.file('assets/01.png')).not.toBeNull();
  });
});

describe('o template vem do Mongo', () => {
  it('o zip leva o main.tex da versão publicada', async () => {
    const { service: servico } = montar({
      template: {
        versao: 9,
        arquivos: {
          'main.tex': '\\documentclass{exam}% DA VERSAO 9\n',
          'preambulo.tex': '\\usepackage{amsmath}\n',
        },
      },
    });

    const { buffer } = await servico.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(buffer);

    expect(await zip.file('main.tex')!.async('string')).toContain(
      'DA VERSAO 9',
    );
  });

  it('sem versão publicada, o 503 propaga — e nada de zip', async () => {
    // ⚠️ O 503 vem do próprio serviço do template (card 10). O que este teste
    // guarda é que o caderno NÃO o engole para cair no disco: um fallback
    // faria o admin achar que sua edição está no ar enquanto a prova sai com
    // o template antigo, sem sinal nenhum.
    const { service: servico } = montar({});
    servico['template'].publicada = jest.fn(async () => {
      throw new ServiceUnavailableException('nenhuma versão publicada');
    });

    await expect(
      servico.gerarZip('sim1', { draft: false }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('a linha de log registra a versão do template', async () => {
    // ⚠️ Quando alguém disser "a prova saiu torta", a primeira pergunta é qual
    // versão gerou. O template muda sem deploy, então não há rastro no git —
    // o log é o único lugar onde essa resposta pode existir.
    const { service: servico } = montar({});
    const log = jest
      .spyOn(servico['logger'], 'log')
      .mockImplementation(() => undefined);

    await servico.gerarZip('sim1', { draft: false });

    expect(log.mock.calls[0][0]).toContain('template=7');
  });
});

describe('gerarZip — logos', () => {
  it('repassa os logos recebidos para o zip', async () => {
    const { service } = montar();
    const vnf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const r = await service.gerarZip('sim1', { draft: false, logos: { vnf } });

    const zip = await JSZip.loadAsync(r.buffer);
    expect(zip.file('logo_vnf.png')).not.toBeNull();
  });

  it('logo ausente vira aviso e entra na contagem', async () => {
    const { service } = montar();

    const r = await service.gerarZip('sim1', {
      draft: false,
      logos: { vnf: Buffer.from([0x89]) },
    });

    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');

    expect(conteudo).toContain(
      '% AVISO: logo do cursinho não disponível — o cabeçalho sai sem a marca',
    );
    expect(conteudo).not.toContain('% AVISO: logo do Você na Facul');
  });

  // ⚠️ É a chamada do GET legado. Não pode lançar.
  it('sem a opção `logos`, gera o zip e avisa os dois', async () => {
    const { service } = montar();

    const r = await service.gerarZip('sim1', { draft: false });

    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');

    expect(zip.file('main.tex')).not.toBeNull();
    expect(conteudo).toContain('% AVISO: logo do Você na Facul não disponível');
    expect(conteudo).toContain('% AVISO: logo do cursinho não disponível');
  });

  it('logo de zero bytes avisa e não entra no zip', async () => {
    const { service } = montar();
    const r = await service.gerarZip('sim1', {
      draft: false,
      logos: { vnf: Buffer.alloc(0), cursinho: Buffer.from([0x89]) },
    });
    const zip = await JSZip.loadAsync(r.buffer);
    expect(zip.file('logo_vnf.png')).toBeNull();
    expect(await zip.file('conteudo.tex')!.async('string')).toContain(
      '% AVISO: logo do Você na Facul não disponível',
    );
  });

  it('avisos de logos vêm antes dos de imagens', async () => {
    const { service } = montar({
      resolucao: {
        arquivos: [],
        avisos: ['assets/01 — imagem não encontrada no acervo'],
        metricas: {
          doCache: 0,
          doBucket: 0,
          daInternet: 0,
          falhas: 1,
          bytes: 0,
          ms: 0,
        },
      },
    });
    const r = await service.gerarZip('sim1', { draft: false });
    const zip = await JSZip.loadAsync(r.buffer);
    const conteudo = await zip.file('conteudo.tex')!.async('string');
    const linhas = conteudo
      .split('\n')
      .filter((l: string) => l.startsWith('% AVISO:'));

    const logoVnfIndex = linhas.findIndex((l) =>
      l.includes('logo do Você na Facul'),
    );
    const imagemIndex = linhas.findIndex((l) => l.includes('assets/01'));

    expect(logoVnfIndex).not.toBe(-1);
    expect(imagemIndex).not.toBe(-1);
    expect(logoVnfIndex).toBeLessThan(imagemIndex);
  });
});

describe('caderno DA PROVA (tickets/038 · 09)', () => {
  const q = (id: string, numero: number) => ({
    numero,
    questao: {
      _id: id,
      status: 1,
      textoQuestao: `enunciado ${id}`,
      pergunta: 'P',
      textoAlternativaA: 'a',
      textoAlternativaB: 'b',
      textoAlternativaC: 'c',
      textoAlternativaD: 'd',
      textoAlternativaE: 'e',
    },
  });
  const comuns = [q('c6', 6), q('c7', 7)];
  const ING = {
    _id: 's-ing',
    idioma: 'Inglês',
    bloqueado: false,
    questoes: [q('i1', 1), q('i2', 2), ...comuns],
  };
  const ESP = {
    _id: 's-esp',
    idioma: 'Espanhol',
    bloqueado: false,
    questoes: [q('e2', 2), q('e1', 1), ...comuns],
  };
  const prova = (o: object = {}) => ({
    _id: 'p1',
    nome: '1º ENEM',
    categoria: { nome: 'Enem Dia 1', duracao: 330, dono: 'Cursinho' },
    simulados: [{ _id: 's-ing' }, { _id: 's-esp' }],
    ...o,
  });
  const montarProva = (
    o: { prova?: object; ing?: object; esp?: object } = {},
  ) => {
    const m = montar({ prova: prova(o.prova) });
    m.simuladoService.getById = jest.fn(async (id: string) =>
      id === 's-ing' ? { ...ING, ...o.ing } : { ...ESP, ...o.esp },
    ) as any;
    return m;
  };
  const conteudoDoZip = async (buffer: Buffer) =>
    (await JSZip.loadAsync(buffer)).file('conteudo.tex')!.async('string');

  it('⚠️ Dia 1: 1–2 de Inglês, 1–2 de Espanhol e só depois as comuns, com o título de cada língua', async () => {
    const { service } = montarProva();
    const { buffer } = await service.gerarZipDaProva('p1', {});
    const tex = await conteudoDoZip(buffer);

    const ordem = [...tex.matchAll(/enunciado (\w+)/g)].map((m) => m[1]);
    expect(ordem).toEqual(['i1', 'i2', 'e1', 'e2', 'c6', 'c7']);
    const posIng = tex.indexOf(
      'LÍNGUA ESTRANGEIRA: INGLÊS — QUESTÕES DE 01 A 05',
    );
    const posEsp = tex.indexOf(
      'LÍNGUA ESTRANGEIRA: ESPANHOL — QUESTÕES DE 01 A 05',
    );
    // e a seção do ENEM antes da 6ª questão, uma vez só
    const ling = 'LINGUAGENS, CÓDIGOS E SUAS TECNOLOGIAS — QUESTÕES DE 06 A 45';
    expect(tex.indexOf(ling)).toBeGreaterThan(tex.indexOf('enunciado e2'));
    expect(tex.indexOf(ling)).toBeLessThan(tex.indexOf('enunciado c6'));
    expect(tex.split(ling)).toHaveLength(2);
    expect(posIng).toBeGreaterThan(-1);
    expect(posEsp).toBeGreaterThan(tex.indexOf('enunciado i2'));
    expect(posEsp).toBeLessThan(tex.indexOf('enunciado e1'));
    // a numeração da segunda língua recomeça no 1
    expect(tex).toContain('\\setcounter{question}{0}');
  });

  it('Dia 2: o simulado único, por número, sem títulos', async () => {
    const d2 = {
      _id: 's-d2',
      idioma: null as string | null,
      bloqueado: false,
      questoes: [q('m92', 92), q('m91', 91)],
    };
    const m = montar({
      prova: prova({
        categoria: { nome: 'Enem Dia 2', duracao: 300, dono: 'Cursinho' },
        simulados: [{ _id: 's-d2' }],
      }),
    });
    m.simuladoService.getById = jest.fn(async () => d2) as any;
    const tex = await conteudoDoZip(
      (await m.service.gerarZipDaProva('p1', {})).buffer,
    );
    expect([...tex.matchAll(/enunciado (\w+)/g)].map((x) => x[1])).toEqual([
      'm91',
      'm92',
    ]);
    expect(tex).not.toContain('LÍNGUA ESTRANGEIRA');
  });

  it('simulado incompleto → 409', async () => {
    const { service } = montarProva({ esp: { bloqueado: true } });
    await expect(service.gerarZipDaProva('p1', {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('prova que não é Enem do cursinho → 400; inexistente → 404', async () => {
    const outra = montarProva({
      prova: { categoria: { nome: 'X', duracao: 1, dono: 'cur-1' } },
    });
    await expect(outra.service.gerarZipDaProva('p1', {})).rejects.toThrow(
      'só para as provas Enem Dia 1 e Enem Dia 2',
    );
    const { service } = montar();
    await expect(service.gerarZipDaProva('p1', {})).rejects.toThrow(
      NotFoundException,
    );
  });
});
