import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { MateriaExist } from 'src/modules/materia/validator/materia-exist.validator';
import { FrenteUnique } from '../validator/frente-unique.validator';

export class CreateFrenteDTOInput {
  @ApiProperty()
  @FrenteUnique({ message: 'O nome sugerido já existe' })
  nome: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MateriaExist({ message: 'Matéria não encontrada' })
  materia?: string;
}

export class UpdateFrenteDTOInput {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nome?: string;
}
