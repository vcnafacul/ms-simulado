import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CategoriaExist } from 'src/modules/categoria/validator/categoria-exist.validator';

export class CreateSimuladoDTOInput {
  @ApiProperty()
  @IsString()
  @CategoriaExist({ message: 'exame não existe' })
  tipoId: string;
}
