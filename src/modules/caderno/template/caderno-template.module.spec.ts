import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { CadernoTemplateController } from './caderno-template.controller';
import { CadernoTemplateModule } from './caderno-template.module';
import { CadernoTemplate } from './caderno-template.schema';
import { CadernoTemplateService } from './caderno-template.service';

/**
 * ⚠️ Compila o módulo de verdade, com o Model trocado por um objeto vazio: o
 * que se quer provar é o WIRING (controller ↔ serviço ↔ repositório), e não o
 * Mongo. Sem o override, o provider do Model pediria uma conexão registrada em
 * `AppModule` e a suíte passaria a depender de um Mongo rodando.
 */
describe('CadernoTemplateModule', () => {
  async function compilar() {
    return await Test.createTestingModule({
      imports: [CadernoTemplateModule],
    })
      .overrideProvider(getModelToken(CadernoTemplate.name))
      .useValue({})
      .compile();
  }

  it('resolve o controller com o serviço injetado', async () => {
    const modulo = await compilar();
    const controller = modulo.get(CadernoTemplateController);

    expect(controller).toBeInstanceOf(CadernoTemplateController);
    expect(modulo.get(CadernoTemplateService)).toBeInstanceOf(
      CadernoTemplateService,
    );

    await modulo.close();
  });

  it('exporta o serviço — o card 11 injeta ele no CadernoService', () => {
    // ⚠️ Sem o export, o card 11 só descobre no boot, com um "Nest can't
    // resolve dependencies" que não diz que o culpado é este array.
    const exportados: unknown[] =
      Reflect.getMetadata('exports', CadernoTemplateModule) ?? [];
    expect(exportados).toContain(CadernoTemplateService);
  });
});
