import { Module } from '@nestjs/common';
import { TipoSimuladoService } from './tipo-simulado.service';
import { TipoSimuladoController } from './tipo-simulado.controller';
import { TipoSimuladoRepository } from './tipo-simulado.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { TipoSimuladoSchema } from './schemas/tipo-simulado.schema';
import { TipoSimuladoUniqueValidator } from './validator/tipo-simulado-unique.validator';
import { MateriaExistValidator } from '../materia/validator/materia-exist.validator';
import { FrenteExistValidator } from '../frente/validator/frente-exist.validator';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'TipoSimulado', schema: TipoSimuladoSchema },
    ]),
    FrenteModule,
    MateriaModule,
  ],
  controllers: [TipoSimuladoController],
  providers: [
    TipoSimuladoService,
    TipoSimuladoRepository,
    TipoSimuladoUniqueValidator,
    MateriaExistValidator,
    FrenteExistValidator,
  ],
  exports: [TipoSimuladoRepository],
})
export class TipoSimuladoModule {}
