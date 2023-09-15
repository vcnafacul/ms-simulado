import { ApiProperty } from '@nestjs/swagger';

export class DefaultResponseDto {
  @ApiProperty()
  key: string;
}
