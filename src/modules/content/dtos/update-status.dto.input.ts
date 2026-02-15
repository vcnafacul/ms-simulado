import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusContent } from '../enums/status-content.enum';

export class UpdateStatusDTOInput {
  @ApiProperty({ enum: StatusContent })
  @IsEnum(StatusContent)
  status: StatusContent;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  message?: string;
}
