import { Module } from '@nestjs/common';
import { CategoriaService } from './categoria.service';
import { CategoriaController } from './categoria.controller';
import { CategoriaRepository } from './categoria.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { Categoria, CategoriaSchema } from './schemas/categoria.schema';
import { CategoriaUniqueValidator } from './validator/categoria-unique.validator';
import { MateriaExistValidator } from '../materia/validator/materia-exist.validator';
import { FrenteExistValidator } from '../frente/validator/frente-exist.validator';
import { FrenteModule } from '../frente/frente.module';
import { MateriaModule } from '../materia/materia.module';
import { ExameModule } from '../exame/exame.module';
import { ExameExistValidator } from '../exame/validator/exame-exist.validator';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Categoria.name, schema: CategoriaSchema },
    ]),
    FrenteModule,
    MateriaModule,
    ExameModule,
  ],
  controllers: [CategoriaController],
  providers: [
    CategoriaService,
    CategoriaRepository,
    CategoriaUniqueValidator,
    MateriaExistValidator,
    FrenteExistValidator,
    ExameExistValidator,
  ],
  exports: [CategoriaRepository],
})
export class CategoriaModule {}
