import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Frente } from 'src/modules/frente/frente.schema';
import { Materia } from 'src/modules/materia/materia.schema';

export class Regra {
  @Prop({
    type: Types.ObjectId,
    ref: Materia.name,
    required: true,
  })
  @ApiProperty()
  materia: Materia;

  @Prop({ required: true })
  @ApiProperty()
  quantidade: number;

  @Prop({
    type: Types.ObjectId,
    ref: Frente.name,
    required: false,
  })
  @ApiProperty()
  frente?: Frente;

  @Prop({ required: false })
  @ApiProperty()
  ano?: number;

  @Prop({ required: false })
  @ApiProperty()
  caderno?: number;
}
