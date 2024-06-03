import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';

export class GetHistoricoDTOInput extends GetAllDtoInput {
  @ApiProperty()
  @IsNumberString()
  userId: number;
}
