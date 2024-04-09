import { ApiProperty } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { Status } from '../enums/status.enum';
import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class QuestaoDTOInput extends GetAllDtoInput {
  @ApiProperty({ default: Status.Pending })
  @IsNumberString()
  status: Status = Status.Pending;

  @ApiProperty({ default: '' })
  @IsString()
  materia: string = '';

  @ApiProperty({ default: '' })
  @IsString()
  frente: string = '';

  @ApiProperty()
  @IsString()
  @IsOptional()
  text: string = '';
}
