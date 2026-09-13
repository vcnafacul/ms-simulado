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
  const service = new CadernoService(
    simuladoService as any,
    resolver as any,
    env as any,
    templateService as any,
  );
  return { service, simuladoService, resolver, env, templateService };
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

    // 5 alternativas em branco (card 02) + 1 imagem (card 03)
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
