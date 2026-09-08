import { Module } from '@nestjs/common';
import { EnvModule } from '../../shared/modules/env/env.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { SimuladoModule } from '../simulado/simulado.module';
import { CadernoController } from './caderno.controller';
import { CadernoService } from './caderno.service';
import { ResolverDeImagens } from './imagens/resolver';

@Module({
  imports: [SimuladoModule, StorageModule, EnvModule],
  controllers: [CadernoController],
  providers: [CadernoService, ResolverDeImagens],
})
export class CadernoModule {}
