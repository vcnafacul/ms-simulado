import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';

export class GetHistoricoDTOInput extends GetAllDtoInput {
  @ApiProperty()
  @IsString()
  userId: string;
}
