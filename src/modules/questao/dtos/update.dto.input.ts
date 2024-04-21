import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';
import { CreateQuestaoDTOInput } from './create.dto.input';

export class UpdateDTOInput extends PartialType(CreateQuestaoDTOInput) {
  @IsString()
  @ApiProperty()
  public _id: string;

  @IsBoolean()
  @ApiProperty()
  public provaClassification: boolean;

  @IsBoolean()
  @ApiProperty()
  public reported: boolean;
}
