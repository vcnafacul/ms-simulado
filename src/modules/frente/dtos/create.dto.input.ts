import { ApiProperty } from '@nestjs/swagger';
import { FrenteUnique } from '../validator/frente-unique.validator';

export class CreateFrenteDTOInput {
  @ApiProperty()
  @FrenteUnique({ message: 'O nome sugerido já existe' })
  nome: string;
}
