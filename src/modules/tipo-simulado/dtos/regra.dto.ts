import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

export class RegraDTO {
  @ApiProperty({ type: String })
  materia: Types.ObjectId;

  @ApiProperty({ type: Number })
  quantidade: number;

  @ApiProperty({ type: String, required: false })
  frente?: Types.ObjectId;

  @ApiProperty({ type: Number, required: false })
  ano?: number;

  @ApiProperty({ type: Number, required: false })
  caderno?: number;
}
