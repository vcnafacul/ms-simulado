import { Test, TestingModule } from '@nestjs/testing';
import { HistoricoController } from './historico.controller';

describe('Controller', () => {
  let controller: HistoricoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoricoController],
    }).compile();

    controller = module.get<HistoricoController>(HistoricoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
