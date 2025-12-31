import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { SubjectUniqueInFrente } from '../validator/subject-unique-in-frente.validator';

export class CreateSubjectDTOInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @SubjectUniqueInFrente({
    message: 'Já existe um subject com esse nome nesta frente',
  })
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  frente: string;
}
