import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { StatusContent } from '../enums/status-content.enum';

export class GetAllContentDtoInput extends GetAllDtoInput {
  @ApiProperty({ enum: StatusContent, required: false })
  @IsOptional()
  status?: StatusContent;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  title?: string;
}
