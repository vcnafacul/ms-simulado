import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';
import { ColaboradorController } from './colaborador.controller';
import { ColaboradorRepository } from './colaborador.repository';
import { ColaboradorSchema } from './colaborador.schema';
import { ColaboradorService } from './colaborador.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Colaborador', schema: ColaboradorSchema },
    ]),
    FrenteModule,
    MateriaModule,
  ],
  controllers: [ColaboradorController],
  providers: [ColaboradorService, ColaboradorRepository],
  exports: [ColaboradorService, ColaboradorRepository],
})
export class ColaboradorModule {}

