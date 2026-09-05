import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CriarHistoricoCartaoDtoInput {
  @ApiProperty() @IsString() @IsNotEmpty() usuario: string;
  @ApiProperty() @IsString() @IsNotEmpty() imageKey: string;
  @ApiProperty() @IsString() @IsNotEmpty() cartaoCode: string;
}
