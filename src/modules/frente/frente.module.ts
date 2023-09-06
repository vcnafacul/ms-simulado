import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FrenteService } from './frente.service';
import { FrenteController } from './frente.controller';
import { FrenteRepository } from './frente.repository';
import { FrenteSchema } from './frente.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Frente', schema: FrenteSchema }]),
  ],
  controllers: [FrenteController],
  providers: [FrenteService, FrenteRepository],
})
export class FrenteModule {}
