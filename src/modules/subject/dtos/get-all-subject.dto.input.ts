import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';

export class GetAllSubjectDtoInput extends GetAllDtoInput {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  frente?: string;
}
