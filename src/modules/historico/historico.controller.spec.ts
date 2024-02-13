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
