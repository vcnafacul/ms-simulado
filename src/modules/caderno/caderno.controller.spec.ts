import { CadernoController } from './caderno.controller';

const montar = (retorno: any = {}) => {
  const service = {
    gerarZip: jest.fn(async () => ({
      nome: 'prova-20260908-1432.zip',
      buffer: Buffer.from('zip'),
      avisos: 3,
      ...retorno,
    })),
  };
  const res = {
    set: jest.fn(),
  };
  return { controller: new CadernoController(service as any), service, res };
};

describe('CadernoController', () => {
  it('devolve o zip com o nome e a contagem de avisos nos headers', async () => {
    const { controller, res } = montar();
    const arquivo = await controller.getCaderno('sim1', undefined, res as any);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Disposition': 'attachment; filename="prova-20260908-1432.zip"',
      'X-Caderno-Avisos': '3',
    });
    expect(await arquivo.getStream().read()).toEqual(Buffer.from('zip'));
  });

  it('sem ?draft, chama o serviço em modo normal', async () => {
    const { controller, service, res } = montar();
    await controller.getCaderno('sim1', undefined, res as any);
    expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: false });
  });

  it('?draft=true liga o rascunho', async () => {
    const { controller, service, res } = montar();
    await controller.getCaderno('sim1', 'true', res as any);
    expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: true });
  });

  it('só a string "true" liga o rascunho', async () => {
    // ⚠️ Query string chega como texto. Tratar "qualquer coisa presente" como
    // ligado faria `?draft=false` LIGAR o rascunho — e o defeito só apareceria
    // como uma marca d'água que ninguém pediu.
    const { controller, service, res } = montar();
    for (const valor of ['false', '0', '', 'sim', 'TRUE']) {
      await controller.getCaderno('sim1', valor, res as any);
    }
    expect(
      service.gerarZip.mock.calls.every((c: any[]) => c[1].draft === false),
    ).toBe(true);
  });

  describe('POST :simuladoId — com logos', () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const PNG_B64 = PNG.toString('base64');

    it('decodifica o corpo e repassa os buffers ao serviço', async () => {
      const { controller, service, res } = montar();

      await controller.postCaderno(
        'sim1',
        undefined,
        res as any,
        { logos: { vnf: PNG_B64, cursinho: PNG_B64 } },
      );

      expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
        draft: false,
        logos: { vnf: PNG, cursinho: PNG },
      });
    });

    it('corpo sem logos chega como objeto vazio, não undefined', async () => {
      const { controller, service, res } = montar();

      await controller.postCaderno('sim1', undefined, res as any, {});

      expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
        draft: false,
        logos: {},
      });
    });

    it('respeita o draft=true, igual ao GET', async () => {
      const { controller, service, res } = montar();

      await controller.postCaderno('sim1', 'true', res as any, {});

      expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
        draft: true,
        logos: {},
      });
    });

    it('só a string "true" liga o rascunho, igual ao GET', async () => {
      const { controller, service, res } = montar();

      await controller.postCaderno('sim1', 'false', res as any, {});

      expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
        draft: false,
        logos: {},
      });
    });

    it('manda os mesmos headers que o GET', async () => {
      const { controller, res } = montar();

      await controller.postCaderno('sim1', undefined, res as any, {});

      expect(res.set).toHaveBeenCalledWith({
        'Content-Disposition': 'attachment; filename="prova-20260908-1432.zip"',
        'X-Caderno-Avisos': '3',
      });
    });

    it('logo com bytes que não são imagem não chega ao serviço', async () => {
      const { controller, service, res } = montar();
      const lixo = Buffer.from('hello world').toString('base64');

      await controller.postCaderno(
        'sim1',
        undefined,
        res as any,
        { logos: { vnf: PNG_B64, cursinho: lixo } },
      );

      expect(service.gerarZip).toHaveBeenCalledWith('sim1', {
        draft: false,
        logos: { vnf: PNG },
      });
    });

    // ⚠️ Requisição sem corpo nenhum: o `@Body()` entrega undefined quando não há
    // body parser aplicável. O `corpo?.` existe para isto.
    it('corpo inteiramente ausente não quebra', async () => {
      const { controller, service, res } = montar();
      await controller.postCaderno('sim1', undefined, res as any, undefined as any);
      expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: false, logos: {} });
    });
  });

  // ⚠️ O GET é o que segura a janela de deploy: se ele sumir antes de o api
  // subir, todo download de caderno morre em 404.
  describe('GET :simuladoId — mantido para a janela de deploy', () => {
    it('continua gerando, sem a chave logos', async () => {
      const { controller, service, res } = montar();

      await controller.getCaderno('sim1', undefined, res as any);

      expect(service.gerarZip).toHaveBeenCalledWith('sim1', { draft: false });
    });
  });
});
