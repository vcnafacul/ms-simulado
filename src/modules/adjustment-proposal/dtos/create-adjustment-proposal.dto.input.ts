import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateAdjustmentProposalDTOInput {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsString()
  file: string;

  @ApiProperty()
  @IsString()
  author: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  comment?: string;
}
