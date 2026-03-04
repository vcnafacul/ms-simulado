import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { FrenteExist } from 'src/modules/frente/validator/frente-exist.validator';

export class CreateSubjectDTOInput {
  @ApiProperty()
  @IsString()
  @FrenteExist({ message: 'Frente não encontrada' })
  frente: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description: string = '';
}
