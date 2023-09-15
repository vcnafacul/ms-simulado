import { Module } from '@nestjs/common';
import { TipoSimuladoService } from './tipo-simulado.service';
import { TipoSimuladoController } from './tipo-simulado.controller';
import { TipoSimuladoRepository } from './tipo-simulado.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { TipoSimuladoSchema } from './schemas/tipo-simulado.schema';
import { TipoSimuladoUniqueValidator } from './validator/tipo-simulado-unique.validator';
import { MateriaSchema } from '../materia/materia.schema';
import { FrenteSchema } from '../frente/frente.schema';
import { MateriaExistValidator } from '../materia/validator/materia-exist.validator';
import { FrenteExistValidator } from '../frente/validator/frente-exist.validator';
import { MateriaRepository } from '../materia/materia.repository';
import { FrenteRepository } from '../frente/frente.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Materia', schema: MateriaSchema },
      { name: 'Frente', schema: FrenteSchema },
      { name: 'TipoSimulado', schema: TipoSimuladoSchema },
    ]),
  ],
  controllers: [TipoSimuladoController],
  providers: [
    TipoSimuladoService,
    TipoSimuladoRepository,
    FrenteRepository,
    MateriaRepository,
    TipoSimuladoUniqueValidator,
    MateriaExistValidator,
    FrenteExistValidator,
  ],
  exports: [TipoSimuladoRepository],
})
export class TipoSimuladoModule {}
