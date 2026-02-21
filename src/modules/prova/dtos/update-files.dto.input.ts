import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProvaFilesDTO {
  @ApiProperty()
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  gabarito?: string;
}
