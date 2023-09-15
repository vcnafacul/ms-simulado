import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FrenteService } from './frente.service';
import { FrenteController } from './frente.controller';
import { FrenteRepository } from './frente.repository';
import { FrenteSchema } from './frente.schema';
import { FrenteExistValidator } from './validator/frente-exist.validator';
import { FrenteUniqueValidator } from './validator/frente-unique.validator';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Frente', schema: FrenteSchema }]),
  ],
  controllers: [FrenteController],
  providers: [
    FrenteService,
    FrenteRepository,
    FrenteUniqueValidator,
    FrenteExistValidator,
  ],
  exports: [FrenteService, FrenteRepository],
})
export class FrenteModule {}
