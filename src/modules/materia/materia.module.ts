import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MateriaSchema } from './materia.schema';
import { MateriaService } from './materia.service';
import { MateriaController } from './materia.controller';
import { MateriaRepository } from './materia.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Materia', schema: MateriaSchema }]),
  ],
  providers: [MateriaService, MateriaRepository],
  controllers: [MateriaController],
})
export class MateriaModule {}
