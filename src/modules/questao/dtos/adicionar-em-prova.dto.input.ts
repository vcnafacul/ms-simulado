import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { EntradaComAnulacaoDTO } from './entrada-com-anulacao.dto';

export class AdicionarEmProvaDTOInput extends EntradaComAnulacaoDTO {
  @ApiProperty()
  @IsString()
  provaId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  numero: number;

  @ApiProperty({ required: false })
  userId?: string;
}
