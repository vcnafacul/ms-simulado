import { ApiProperty } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { Status } from '../enums/status.enum';
import { IsNumberString } from 'class-validator';

export class QuestaoDTOInput extends GetAllDtoInput {
  @ApiProperty()
  @IsNumberString()
  status: Status;
}
