import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SubjectExist } from 'src/modules/questao/subject/validator/subject-exist.validator';

export class CreateContentDTOInput {
  @ApiProperty()
  @IsString()
  @SubjectExist({ message: 'Tema não encontrado' })
  subject: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  userId: string;
}
