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
});
