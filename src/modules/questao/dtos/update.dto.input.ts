import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateQuestaoDTOInput } from './create.dto.input';
import { IsString } from 'class-validator';

export class UpdateDTOInput extends PartialType(CreateQuestaoDTOInput) {
  @IsString()
  @ApiProperty()
  _id: string;
}
