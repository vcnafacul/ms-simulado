import { ApiProperty } from '@nestjs/swagger';
import { MateriaUnique } from '../validator/materia-unique.validator';

export class CreateMateriaDTOInput {
  @ApiProperty()
  @MateriaUnique({ message: 'O nome sugerido já existe' })
  nome: string;
}
