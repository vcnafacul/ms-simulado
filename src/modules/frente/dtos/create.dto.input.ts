import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { FrenteUnique } from '../validator/frente-unique.validator';

export class CreateFrenteDTOInput {
  @ApiProperty()
  @FrenteUnique({ message: 'O nome sugerido já existe' })
  nome: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  materia: string;
}
