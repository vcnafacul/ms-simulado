import { INestApplication } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { zipCom } from './__fixtures__/zip';
import { CadernoTemplateController } from './caderno-template.controller';
import { CadernoTemplateService } from './caderno-template.service';

const zipFalso = (buffer = Buffer.from('zip')) =>
  ({ buffer, originalname: 'projeto.zip' }) as Express.Multer.File;

function controllerCom(servico: Record<string, unknown> = {}) {
  const s = {
    publicada: jest.fn().mockResolvedValue({ versao: 3 }),
    rascunho: jest.fn().mockResolvedValue(null),
    versoes: jest.fn().mockResolvedValue([]),
    salvarRascunho: jest
      .fn()
      .mockResolvedValue({ aceitos: [], ignorados: [], erros: [], avisos: [] }),
    publicar: jest.fn().mockResolvedValue({ versao: 4 }),
    restaurar: jest.fn().mockResolvedValue(undefined),
    descartarRascunho: jest.fn().mockResolvedValue(undefined),
    ...servico,
  } as any;
  return { servico: s, controller: new CadernoTemplateController(s) };
}

describe('POST /template/rascunho', () => {
  it('sem arquivo → 400, e não chama o serviço', async () => {
    const { servico, controller } = controllerCom();

    await expect(
      controller.subirRascunho(undefined as any, {
        criadorId: 'u1',
        notas: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(servico.salvarRascunho).not.toHaveBeenCalled();
  });

  it('zip inválido → 400 com o motivo da extração', async () => {
    const { controller } = controllerCom();

    await expect(
      controller.subirRascunho(zipFalso(Buffer.from('não é zip')), {
        criadorId: 'u1',
        notas: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ERRO DE LINT devolve 200 com os erros, não exceção', async () => {
    // ⚠️ O contrato do card. Um 4xx aqui faria o cliente descartar o corpo e
    // a pessoa perder o upload.
    const { controller } = controllerCom({
      salvarRascunho: jest.fn().mockResolvedValue({
        aceitos: ['main.tex', 'preambulo.tex'],
        ignorados: ['main.pdf'],
        erros: ['main.tex: falta \\input{conteudo}'],
        avisos: [],
      }),
    });

    const zip = await zipCom({ 'main.tex': 'a', 'preambulo.tex': 'b' });
    const r = await controller.subirRascunho(zipFalso(zip), {
      criadorId: 'u1',
      notas: 'capa nova',
    });

    expect(r.erros).toHaveLength(1);
  });

  it('repassa ao serviço o que a extração devolveu, e notas ausente vira ""', async () => {
    const { servico, controller } = controllerCom();

    const zip = await zipCom({
      'main.tex': 'a',
      'preambulo.tex': 'b',
      'main.pdf': 'lixo',
    });
    await controller.subirRascunho(zipFalso(zip), { criadorId: 'u7' });

    expect(servico.salvarRascunho).toHaveBeenCalledWith({
      arquivos: { 'main.tex': 'a', 'preambulo.tex': 'b' },
      ignorados: ['main.pdf'],
      criadorId: 'u7',
      notas: '',
    });
  });
});

describe('GET /template', () => {
  it('devolve a publicada — o 503 é decisão do serviço, não do controller', async () => {
    const { servico, controller } = controllerCom();
    await expect(controller.getPublicada()).resolves.toEqual({ versao: 3 });
    expect(servico.publicada).toHaveBeenCalled();
  });
});

describe('GET /template/rascunho', () => {
  it('sem rascunho → 404', async () => {
    const { controller } = controllerCom();
    await expect(controller.getRascunho()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('com rascunho → devolve o rascunho', async () => {
    const { controller } = controllerCom({
      rascunho: jest.fn().mockResolvedValue({ versao: 0, notas: 'capa nova' }),
    });
    await expect(controller.getRascunho()).resolves.toEqual({
      versao: 0,
      notas: 'capa nova',
    });
  });
});

describe('DELETE /template/rascunho', () => {
  it('descarta pelo serviço', async () => {
    const { servico, controller } = controllerCom();
    await controller.descartarRascunho();
    expect(servico.descartarRascunho).toHaveBeenCalled();
  });

  it('propaga o 404 de quando não havia nada para apagar', async () => {
    const { controller } = controllerCom({
      descartarRascunho: jest
        .fn()
        .mockRejectedValue(new NotFoundException('nada')),
    });
    await expect(controller.descartarRascunho()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('POST /template/rascunho/publicar', () => {
  it('devolve a versão nova', async () => {
    const { controller } = controllerCom();
    await expect(controller.publicar()).resolves.toEqual({ versao: 4 });
  });
});

describe('GET /template/versoes', () => {
  it('devolve a lista que o serviço deu, sem reordenar', async () => {
    // ⚠️ A ordem decrescente é do repositório. Se o controller resolvesse
    // ordenar de novo, uma mudança lá passaria a não ter efeito nenhum.
    const lista = [{ versao: 3 }, { versao: 2 }, { versao: 1 }];
    const { controller } = controllerCom({
      versoes: jest.fn().mockResolvedValue(lista),
    });
    await expect(controller.versoes()).resolves.toBe(lista);
  });
});

describe('POST /template/versoes/:n/restaurar', () => {
  it('passa o número e o criador ao serviço', async () => {
    const { servico, controller } = controllerCom();
    await controller.restaurar(2, { criadorId: 'u1' });
    expect(servico.restaurar).toHaveBeenCalledWith(2, 'u1');
  });

  it('propaga o 404 de versão inexistente', async () => {
    const { controller } = controllerCom({
      restaurar: jest.fn().mockRejectedValue(new NotFoundException('não há')),
    });
    await expect(
      controller.restaurar(99, { criadorId: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('as rotas', () => {
  it('estão sob v1/caderno/template', () => {
    // ⚠️ O card 12 monta o proxy em cima deste caminho; divergir aqui quebra
    // um repo que ainda não existe, e o erro aparece só na integração.
    expect(Reflect.getMetadata('path', CadernoTemplateController)).toBe(
      'v1/caderno/template',
    );
  });
});

/**
 * ⚠️ Os pipes de rota não rodam quando se chama o método direto — só num app
 * de verdade. Sem `ParseIntPipe` no `:n`, `abc` chega como string, a
 * comparação com `versao` no Mongo não casa e o cliente leva 404 no lugar de
 * 400: um erro de digitação vira "essa versão não existe". Só este bloco
 * morde essa troca.
 */
describe('os pipes de rota (app de verdade)', () => {
  let app: INestApplication;
  const servico = {
    publicada: jest.fn().mockResolvedValue({ versao: 3 }),
    rascunho: jest.fn().mockResolvedValue(null),
    versoes: jest.fn().mockResolvedValue([]),
    salvarRascunho: jest.fn(),
    publicar: jest.fn().mockResolvedValue({ versao: 4 }),
    restaurar: jest.fn().mockResolvedValue(undefined),
    descartarRascunho: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      controllers: [CadernoTemplateController],
      providers: [{ provide: CadernoTemplateService, useValue: servico }],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('versão não numérica → 400, e o serviço nem é chamado', async () => {
    await request(app.getHttpServer())
      .post('/v1/caderno/template/versoes/abc/restaurar')
      .send({ criadorId: 'u1' })
      .expect(400);

    expect(servico.restaurar).not.toHaveBeenCalled();
  });

  it('versão numérica chega ao serviço como number, não string', async () => {
    await request(app.getHttpServer())
      .post('/v1/caderno/template/versoes/2/restaurar')
      .send({ criadorId: 'u1' })
      .expect(201);

    expect(servico.restaurar).toHaveBeenCalledWith(2, 'u1');
  });

  it('DELETE do rascunho responde 204 sem corpo', async () => {
    const r = await request(app.getHttpServer())
      .delete('/v1/caderno/template/rascunho')
      .expect(204);
    expect(r.text).toBe('');
  });

  it('POST do rascunho com erro de lint responde 200, não 4xx nem 201', async () => {
    // ⚠️ O par HTTP do teste de unidade acima: aqui o STATUS é o que se
    // afirma. 201 faria o cliente tratar como "criado sem problema"; 4xx
    // faria descartar o corpo com os erros.
    servico.salvarRascunho.mockResolvedValue({
      aceitos: ['main.tex', 'preambulo.tex'],
      ignorados: [],
      erros: ['main.tex: falta \\input{conteudo}'],
      avisos: [],
    });
    const zip = await zipCom({ 'main.tex': 'a', 'preambulo.tex': 'b' });

    const r = await request(app.getHttpServer())
      .post('/v1/caderno/template/rascunho')
      .field('criadorId', 'u1')
      .attach('arquivo', zip, 'projeto.zip')
      .expect(200);

    expect(r.body.erros).toHaveLength(1);
  });
});
