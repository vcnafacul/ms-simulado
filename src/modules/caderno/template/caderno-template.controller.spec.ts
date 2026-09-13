import { INestApplication } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import JSZip from 'jszip';
import request from 'supertest';
import { zipCom } from './__fixtures__/zip';
import { CadernoTemplateController } from './caderno-template.controller';
import { CadernoTemplateService } from './caderno-template.service';
import { CadernoController } from '../caderno.controller';
import { CadernoService } from '../caderno.service';

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
    porVersao: jest.fn().mockResolvedValue({ versao: 2 }),
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

/**
 * ⚠️ O mock padrão de `controllerCom` devolve documentos sem `arquivos`
 * (`{ versao: 3 }`), o que basta para os endpoints que só repassam. O zip de
 * teste MONTA o pacote de verdade, então aqui a origem precisa carregar os
 * dois `.tex`. É de propósito que o montador não seja dublado: assim estes
 * testes provam que o template escolhido é o que sai no zip, e não só que o
 * método certo do serviço foi chamado.
 */
describe('GET /template/teste', () => {
  const arquivosCom = (marca: string) => ({
    'main.tex': `\\documentclass{exam}% ${marca}\n`,
    'preambulo.tex': '\\usepackage{amsmath}\n',
  });

  const resFalso = () => ({ set: jest.fn() }) as any;

  const controllerDeTeste = (servico: Record<string, unknown> = {}) =>
    controllerCom({
      publicada: jest
        .fn()
        .mockResolvedValue({ versao: 3, arquivos: arquivosCom('PUBLICADA') }),
      rascunho: jest
        .fn()
        .mockResolvedValue({ versao: 0, arquivos: arquivosCom('RASCUNHO') }),
      porVersao: jest
        .fn()
        .mockResolvedValue({ versao: 2, arquivos: arquivosCom('V2') }),
      ...servico,
    });

  const texDoZip = async (streamable: any, nome: string) =>
    await (await JSZip.loadAsync(streamable.getStream().read()))
      .file(nome)!
      .async('string');

  it('sem parâmetro, usa a PUBLICADA', async () => {
    const { servico, controller } = controllerDeTeste();
    await controller.zipDeTeste(undefined, undefined, resFalso());
    expect(servico.publicada).toHaveBeenCalled();
    expect(servico.rascunho).not.toHaveBeenCalled();
  });

  it('?versao=3 usa a v3', async () => {
    const { servico, controller } = controllerDeTeste();
    await controller.zipDeTeste('3', undefined, resFalso());
    expect(servico.porVersao).toHaveBeenCalledWith(3);
  });

  it('?rascunho=1 usa o rascunho', async () => {
    const { servico, controller } = controllerDeTeste();
    await controller.zipDeTeste(undefined, '1', resFalso());
    expect(servico.rascunho).toHaveBeenCalled();
  });

  it('?rascunho=true também', async () => {
    const { servico, controller } = controllerDeTeste();
    await controller.zipDeTeste(undefined, 'true', resFalso());
    expect(servico.rascunho).toHaveBeenCalled();
  });

  it('os dois juntos → 400', async () => {
    const { controller } = controllerDeTeste();
    await expect(
      controller.zipDeTeste('3', '1', resFalso()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['xis', 'sim', 'false', '0', ''])(
    '?rascunho=%s → 400, e NÃO a publicada em silêncio',
    async (valor) => {
      // ⚠️ Este projeto já se queimou com z.coerce.boolean() tratando "false"
      // como true. Cair na publicada porque o valor não foi entendido devolve
      // a versão errada sem sinal nenhum — o defeito exato que este endpoint
      // existe para evitar.
      const { servico, controller } = controllerDeTeste();
      await expect(
        controller.zipDeTeste(undefined, valor, resFalso()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(servico.publicada).not.toHaveBeenCalled();
    },
  );

  it.each(['abc', '', '1.5', '-1'])('?versao=%s → 400', async (valor) => {
    // ⚠️ `versao` é query OPCIONAL: um ParseIntPipe cru rejeitaria a ausência
    // junto com o lixo, e a ausência é o caso normal.
    const { servico, controller } = controllerDeTeste();
    await expect(
      controller.zipDeTeste(valor, undefined, resFalso()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(servico.porVersao).not.toHaveBeenCalled();
  });

  it('sem rascunho pendente → 404', async () => {
    const { controller } = controllerDeTeste({
      rascunho: jest.fn().mockResolvedValue(null),
    });
    await expect(
      controller.zipDeTeste(undefined, '1', resFalso()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o zip sai com o template da ORIGEM escolhida, não com o da publicada', async () => {
    // ⚠️ Sem isto, um controller que chamasse `porVersao` e depois montasse o
    // zip com a publicada passaria em todos os testes acima: eles só olham
    // qual método foi chamado.
    const { controller } = controllerDeTeste();
    const zip = await controller.zipDeTeste('2', undefined, resFalso());
    expect(await texDoZip(zip, 'main.tex')).toContain('% V2');
  });

  it('o nome do arquivo diz a versão', async () => {
    const { controller } = controllerDeTeste();
    const res = resFalso();
    await controller.zipDeTeste('2', undefined, res);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Disposition': 'attachment; filename="template-teste-v2.zip"',
      }),
    );
  });

  it('NÃO escreve nada', async () => {
    // O card é explícito: leitura pura. Uma versão anterior gravava
    // `testadoEm` a cada download; saiu quando a compilação no Overleaf
    // virou passo obrigatório por construção.
    const { servico, controller } = controllerDeTeste();
    await controller.zipDeTeste(undefined, undefined, resFalso());
    for (const escrita of [
      'salvarRascunho',
      'publicar',
      'restaurar',
      'descartarRascunho',
    ]) {
      expect(servico[escrita]).not.toHaveBeenCalled();
    }
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

/**
 * A colisão de rota entre os dois controllers do caderno.
 *
 * ⚠️ **Este bloco monta os DOIS controllers, na ordem do `app.module.ts`.**
 * Nenhum outro teste desta suíte pega o defeito que ele guarda, porque a
 * colisão não existe no controller — ela nasce no roteamento, depois do
 * wiring dos módulos. Chamar o método direto nunca a alcança.
 *
 * O que aconteceu de verdade: `CadernoController` é `v1/caderno` com
 * `@Get(':simuladoId')`, e o segmento literal `template` casava com o param.
 * Como o `CadernoModule` vem antes no `app.module.ts`, ele engolia
 * `GET /v1/caderno/template` e o pedido morria em
 * `CastError: Cast to ObjectId failed for value "template"`.
 */
describe('a rota /template não é engolida pelo :simuladoId', () => {
  let app: INestApplication;

  const servicoTemplate = {
    publicada: jest.fn().mockResolvedValue({ versao: 7 }),
    rascunho: jest.fn(),
    versoes: jest.fn(),
    salvarRascunho: jest.fn(),
    publicar: jest.fn(),
    restaurar: jest.fn(),
    descartarRascunho: jest.fn(),
  };
  const servicoCaderno = { gerarZip: jest.fn() };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      // ⚠️ A ORDEM É A DO app.module.ts DE PROPÓSITO: CadernoModule antes.
      // Inverter aqui esconderia o defeito, que é justamente o que este
      // teste existe para impedir.
      controllers: [CadernoController, CadernoTemplateController],
      providers: [
        { provide: CadernoService, useValue: servicoCaderno },
        { provide: CadernoTemplateService, useValue: servicoTemplate },
      ],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    servicoCaderno.gerarZip.mockClear();
    servicoTemplate.publicada.mockClear();
  });

  it('GET /v1/caderno/template chega no template, não no gerador de prova', async () => {
    const r = await request(app.getHttpServer())
      .get('/v1/caderno/template')
      .expect(200);

    expect(r.body).toEqual({ versao: 7 });
    // ⚠️ A asserção que separa "respondeu" de "respondeu pelo caminho certo".
    expect(servicoCaderno.gerarZip).not.toHaveBeenCalled();
  });

  it('um ObjectId de verdade continua chegando no gerador de prova', async () => {
    // ⚠️ O par do teste acima: a restrição do param não pode ter quebrado o
    // caminho que o card 04 entregou.
    servicoCaderno.gerarZip.mockResolvedValue({
      nome: 'caderno.zip',
      buffer: Buffer.from('ZIP'),
      avisos: 0,
    });

    await request(app.getHttpServer())
      .get('/v1/caderno/65ecc850a528b39d273e7900')
      .expect(200);

    expect(servicoCaderno.gerarZip).toHaveBeenCalledWith(
      '65ecc850a528b39d273e7900',
      { draft: false },
    );
  });

  it('um id malformado não alcança serviço nenhum', async () => {
    await request(app.getHttpServer())
      .get('/v1/caderno/nao-e-objectid')
      .expect(404);
    expect(servicoCaderno.gerarZip).not.toHaveBeenCalled();
    expect(servicoTemplate.publicada).not.toHaveBeenCalled();
  });
});
