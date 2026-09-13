import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CadernoTemplateService } from './caderno-template.service';

const TEMPLATE_BOM = {
  'main.tex': [
    '\\documentclass{exam}',
    '\\input{preambulo}',
    '\\input{metadados}',
    '\\begin{document}',
    '\\begin{questions}',
    '\\input{conteudo}',
    '\\end{questions}',
    '\\end{document}',
  ].join('\n'),
  'preambulo.tex': '\\usepackage[T1]{fontenc}',
};

const TEMPLATE_RUIM = {
  ...TEMPLATE_BOM,
  'main.tex': TEMPLATE_BOM['main.tex'].replace(
    '\\input{conteudo}',
    '% \\input{conteudo}',
  ),
};

function servicoCom(repo: Record<string, unknown> = {}) {
  const sessao = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const repositorio = {
    publicada: jest.fn().mockResolvedValue(null),
    rascunho: jest.fn().mockResolvedValue(null),
    versoes: jest.fn().mockResolvedValue([]),
    porVersao: jest.fn().mockResolvedValue(null),
    maiorVersao: jest.fn().mockResolvedValue(0),
    criarRascunho: jest.fn().mockResolvedValue(undefined),
    substituirRascunho: jest.fn().mockResolvedValue(undefined),
    descartarRascunho: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    arquivarPublicada: jest.fn().mockResolvedValue(undefined),
    promoverRascunho: jest.fn().mockResolvedValue(undefined),
    startSession: jest.fn().mockResolvedValue(sessao),
    ...repo,
  } as any;
  return {
    sessao,
    repositorio,
    servico: new CadernoTemplateService(repositorio),
  };
}

describe('publicada()', () => {
  it('devolve a publicada quando existe', async () => {
    const { servico } = servicoCom({
      publicada: jest.fn().mockResolvedValue({ versao: 3 }),
    });
    expect((await servico.publicada()).versao).toBe(3);
  });

  it('NÃO existindo, lança 503 — e não cai no repo', async () => {
    // ⚠️ Depois deste card o Mongo é a fonte da verdade. Um fallback
    // silencioso ao disco reintroduziria a dúvida sobre qual é a atual: a
    // prova sairia com o layout antigo e ninguém saberia por quê.
    const { servico } = servicoCom();
    await expect(servico.publicada()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('porVersao()', () => {
  it('devolve a versão quando existe', async () => {
    const { servico } = servicoCom({
      porVersao: jest
        .fn()
        .mockResolvedValue({ versao: 2, arquivos: TEMPLATE_BOM }),
    });
    const encontrada = await servico.porVersao(2);
    expect(encontrada.versao).toBe(2);
    expect(encontrada.arquivos).toEqual(TEMPLATE_BOM);
  });

  it('versão inexistente → 404', async () => {
    // ⚠️ 404 aqui, e não `null` devolvido ao controller: o zip de teste de
    // uma versão que não existe é um pedido errado, e cair na publicada em
    // silêncio devolveria um template que não é o que se pediu conferir.
    const { servico } = servicoCom();
    await expect(servico.porVersao(99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('salvarRascunho()', () => {
  it('com lint limpo: salva e devolve sem erros', async () => {
    const { repositorio, servico } = servicoCom();

    const r = await servico.salvarRascunho({
      arquivos: TEMPLATE_BOM,
      ignorados: ['main.pdf'],
      criadorId: 'u1',
      notas: 'capa nova',
    });

    expect(r.erros).toEqual([]);
    expect(r.aceitos.sort()).toEqual(['main.tex', 'preambulo.tex']);
    expect(r.ignorados).toEqual(['main.pdf']);
    expect(repositorio.substituirRascunho).toHaveBeenCalled();
  });

  it('COM ERRO DE LINT: salva assim mesmo e devolve os erros', async () => {
    // ⚠️ 200 com erros, não 4xx. Ele não perde o upload; quem recusa é o
    // publicar. Perder o zip de quem acabou de editar no Overleaf é o pior
    // resultado possível deste fluxo.
    const { repositorio, servico } = servicoCom();

    const r = await servico.salvarRascunho({
      arquivos: TEMPLATE_RUIM,
      ignorados: [],
      criadorId: 'u1',
      notas: '',
    });

    expect(r.erros.length).toBeGreaterThan(0);
    expect(repositorio.substituirRascunho).toHaveBeenCalled();
  });
});

describe('publicar()', () => {
  it('sem rascunho → 409', async () => {
    const { servico } = servicoCom();
    await expect(servico.publicar()).rejects.toBeInstanceOf(ConflictException);
  });

  it('RASCUNHO COM ERRO DE LINT → 409 com a lista, e nada é escrito', async () => {
    // ⚠️ O lint roda de novo aqui: o rascunho pode ter vindo de uma
    // restauração feita antes de uma regra nova existir.
    const { repositorio, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: TEMPLATE_RUIM }),
    });

    await expect(servico.publicar()).rejects.toBeInstanceOf(ConflictException);
    expect(repositorio.promoverRascunho).not.toHaveBeenCalled();
    expect(repositorio.arquivarPublicada).not.toHaveBeenCalled();
  });

  it('AVISO não impede publicar', async () => {
    // ⚠️ Chave desbalanceada é aviso. Se travasse aqui, a decisão do usuário
    // teria sido revertida silenciosamente no serviço.
    const { repositorio, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({
        arquivos: {
          ...TEMPLATE_BOM,
          'preambulo.tex': '\\def\\x{aberta',
        },
      }),
      maiorVersao: jest.fn().mockResolvedValue(3),
    });

    await servico.publicar();

    expect(repositorio.promoverRascunho).toHaveBeenCalledWith(
      4,
      expect.anything(),
    );
  });

  it('versao = max + 1, olhando o maior de TODOS os status', async () => {
    const { repositorio, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: TEMPLATE_BOM }),
      maiorVersao: jest.fn().mockResolvedValue(7),
    });

    await servico.publicar();

    expect(repositorio.promoverRascunho).toHaveBeenCalledWith(
      8,
      expect.anything(),
    );
  });

  it('ARQUIVA ANTES DE PROMOVER', async () => {
    // ⚠️ Ordem, não conveniência. Um estado intermediário de "zero
    // publicadas" devolve 503 — visível, e republicar conserta. Um de "duas
    // publicadas" é ambíguo, e a ambiguidade sobre qual é a atual é o que
    // este card existe para evitar.
    const ordem: string[] = [];
    const { servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: TEMPLATE_BOM }),
      arquivarPublicada: jest.fn(async () => {
        ordem.push('arquivar');
      }),
      promoverRascunho: jest.fn(async () => {
        ordem.push('promover');
      }),
    });

    await servico.publicar();

    expect(ordem).toEqual(['arquivar', 'promover']);
  });

  it('commita a transação no caminho feliz', async () => {
    const { sessao, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: TEMPLATE_BOM }),
    });

    await servico.publicar();

    expect(sessao.startTransaction).toHaveBeenCalled();
    expect(sessao.commitTransaction).toHaveBeenCalled();
    expect(sessao.abortTransaction).not.toHaveBeenCalled();
    expect(sessao.endSession).toHaveBeenCalled();
  });

  it('ABORTA quando a segunda escrita falha', async () => {
    // ⚠️ Sem o abort, a sessão fica aberta e a primeira escrita pode vazar.
    const { sessao, servico } = servicoCom({
      rascunho: jest.fn().mockResolvedValue({ arquivos: TEMPLATE_BOM }),
      promoverRascunho: jest.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(servico.publicar()).rejects.toThrow('boom');
    expect(sessao.abortTransaction).toHaveBeenCalled();
    expect(sessao.commitTransaction).not.toHaveBeenCalled();
    expect(sessao.endSession).toHaveBeenCalled();
  });
});

describe('restaurar()', () => {
  it('cria rascunho com o conteúdo da versão e origemVersao', async () => {
    const { repositorio, servico } = servicoCom({
      porVersao: jest
        .fn()
        .mockResolvedValue({ versao: 2, arquivos: TEMPLATE_BOM }),
    });

    await servico.restaurar(2, 'u1');

    const [dados] = repositorio.substituirRascunho.mock.calls[0];
    expect(dados.origemVersao).toBe(2);
    expect(dados.criadorId).toBe('u1');
    expect(dados.arquivos).toEqual(TEMPLATE_BOM);
  });

  it('versão inexistente → 404', async () => {
    const { servico } = servicoCom();
    await expect(servico.restaurar(99, 'u1')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('restaurar NÃO reabre a versão antiga — o histórico só avança', async () => {
    // ⚠️ Restaurar cria rascunho; publicar gera número novo. Nada de ponteiro
    // que anda para trás.
    const { repositorio, servico } = servicoCom({
      porVersao: jest
        .fn()
        .mockResolvedValue({ versao: 2, arquivos: TEMPLATE_BOM }),
    });

    await servico.restaurar(2, 'u1');

    expect(repositorio.promoverRascunho).not.toHaveBeenCalled();
    expect(repositorio.arquivarPublicada).not.toHaveBeenCalled();
  });
});

describe('descartarRascunho()', () => {
  it('sem rascunho → 404, e não finge que apagou', async () => {
    const { servico } = servicoCom({
      descartarRascunho: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    });
    await expect(servico.descartarRascunho()).rejects.toMatchObject({
      status: 404,
    });
  });
});
