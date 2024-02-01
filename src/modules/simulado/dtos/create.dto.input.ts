import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { TipoSimuladoExist } from 'src/modules/tipo-simulado/validator/tipo-simulado-exist.validator';

export class CreateSimuladoDTOInput {
  @ApiProperty()
  @IsString()
  @TipoSimuladoExist({ message: 'exame não existe' })
  tipoId: string;
}
