import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Prova, ProvaSchema } from '../prova/prova.schema';
import { ProvaRepository } from '../prova/prova.repository';
import { EnvModule } from '../../shared/modules/env/env.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { SimuladoModule } from '../simulado/simulado.module';
import { CadernoController } from './caderno.controller';
import { CadernoService } from './caderno.service';
import { ResolverDeImagens } from './imagens/resolver';
import { CadernoTemplateModule } from './template/caderno-template.module';

@Module({
  imports: [
    SimuladoModule,
    StorageModule,
    EnvModule,
    CadernoTemplateModule,
    // tickets/038: o caderno da prova. `forFeature` + repositório, e não o
    // ProvaModule, para não fechar ciclo com o SimuladoModule.
    MongooseModule.forFeature([{ name: Prova.name, schema: ProvaSchema }]),
  ],
  controllers: [CadernoController],
  providers: [CadernoService, ResolverDeImagens, ProvaRepository],
})
export class CadernoModule {}
