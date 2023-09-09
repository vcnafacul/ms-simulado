import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportDTO {
  @IsNumber()
  @ApiProperty()
  entityId: number;

  @IsString()
  @ApiProperty()
  message: string;
}
