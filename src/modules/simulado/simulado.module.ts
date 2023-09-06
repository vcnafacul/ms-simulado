import { Module } from '@nestjs/common';
import { SimuladoService } from './simulado.service';
import { SimuladoController } from './simulado.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { SimuladoSchema } from './simulado.schema';
import { SimuladoRepository } from './simulado.repository';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Simulado', schema: SimuladoSchema }])],
  controllers: [SimuladoController],
  providers: [SimuladoService, SimuladoRepository],
})
export class SimuladoModule {}
