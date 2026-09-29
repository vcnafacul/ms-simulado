import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
} from 'class-validator';

/** tickets/026, card 05 — quem fez os simulados de um evento, pelo cartão. */
export class ParticipantesPorCartaoDtoInput {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  simuladoIds: string[];

  /** Só histórico criado a partir daqui (o início da janela do evento). */
  @ApiProperty()
  @IsDateString()
  desde: string;
}
