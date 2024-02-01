import { ApiProperty } from '@nestjs/swagger';
import { Localizacao } from '../enum/localizacao.enum';
import { IsEnum } from 'class-validator';
import { ExameUnique } from '../validator/exame-unique.validator';

export class CreateExameDtoInput {
  @ApiProperty()
  @ExameUnique({ message: 'O nome sugerido já existe' })
  nome: string;

  @ApiProperty()
  @IsEnum(Localizacao)
  localizacao: Localizacao;
}
