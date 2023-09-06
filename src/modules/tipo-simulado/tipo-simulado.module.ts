import { Module } from '@nestjs/common';
import { TipoSimuladoService } from './tipo-simulado.service';
import { TipoSimuladoController } from './tipo-simulado.controller';
import { TipoSimuladoRepository } from './tipo-simulado.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { TipoSimuladoSchema } from './schemas/tipo-simulado.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'TipoSimulado', schema: TipoSimuladoSchema },
    ]),
  ],
  providers: [TipoSimuladoService],
  controllers: [TipoSimuladoController, TipoSimuladoRepository],
})
export class TipoSimuladoModule {}
