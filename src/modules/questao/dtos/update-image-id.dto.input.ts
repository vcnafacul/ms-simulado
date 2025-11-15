import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateImageIdDTOInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  public imageId?: string | null;
}
