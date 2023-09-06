import { ApiProperty } from '@nestjs/swagger';

export class CreateFrenteDTOInput {
  @ApiProperty()
  nome: string;
}
