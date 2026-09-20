import { Test, TestingModule } from '@nestjs/testing';
import { HistoricoController } from './historico.controller';
import { AppModule } from 'src/app.module';

describe('Controller', () => {
  let controller: HistoricoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    controller = module.get<HistoricoController>(HistoricoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('HistoricoController.getById — a fiação do dono', () => {
  // ⚠️ Sem este bloco, trocar `dto.usuario` por `undefined` na chamada ao
  // service passava na suíte inteira: o smoke test acima só confere que o
  // controller existe. E `undefined` é o gate desligado — o repositório
  // voltaria a casar o documento de qualquer um.
  const montar = () => {
    const service = { getById: jest.fn().mockResolvedValue({ _id: 'h1' }) };
    return { ctrl: new HistoricoController(service as any), service };
  };

  it('⚠️ repassa o `usuario` da query ao service — é o gate inteiro', async () => {
    const { ctrl, service } = montar();

    await ctrl.getById('h1', { usuario: 'u-dono' } as any);

    expect(service.getById).toHaveBeenCalledWith('h1', 'u-dono');
  });

  it('⚠️ o segundo argumento nunca é undefined quando veio usuario', async () => {
    const { ctrl, service } = montar();

    await ctrl.getById('h1', { usuario: 'u-dono' } as any);

    expect(service.getById.mock.calls[0][1]).toBeDefined();
  });

  it('o id do caminho vai inteiro, sem reinterpretação', async () => {
    const { ctrl, service } = montar();

    await ctrl.getById('h1?usuario=alheio', { usuario: 'u-dono' } as any);

    expect(service.getById).toHaveBeenCalledWith('h1?usuario=alheio', 'u-dono');
  });
});
