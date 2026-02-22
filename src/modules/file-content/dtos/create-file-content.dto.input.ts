import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateFileContentDTOInput {
  @ApiProperty()
  @IsString()
  fileKey: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  originalName?: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsString()
  uploadedBy: string;
}
