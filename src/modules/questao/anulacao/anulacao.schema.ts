import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { MotivoAnulacao } from '../enums/motivo-anulacao.enum';

/**
 * Uma anulação (tickets/042, D1/D3).
 *
 * ⚠️ **Mora no SLOT da prova** (`QuestaoNaContainer.anulacao`), não na questão:
 * a questão é global e entra em provas de vários cursinhos (A1). A fonte da
 * verdade para a nota é o container; `Questao.anulacoes` é só o espelho.
 */
@Schema({ _id: false, versionKey: false })
export class Anulacao {
  @Prop({ type: String, enum: Object.values(MotivoAnulacao), required: true })
  @ApiProperty({ enum: MotivoAnulacao })
  motivo: MotivoAnulacao;

  @Prop({ type: String, required: true })
  @ApiProperty()
  justificativa: string;

  @Prop({ type: Date, required: true })
  @ApiProperty()
  em: Date;

  @Prop({ type: String, required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  porUsuarioId: string | null;

  @Prop({ type: String, required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  porCursinhoId: string | null;
}

export const AnulacaoSchema = SchemaFactory.createForClass(Anulacao);

/**
 * A entrada do espelho na questão: a anulação + onde ela vale.
 *
 * ⚠️ `provaId` string (id hex), como o `provaBase`: serve para casar e montar
 * link, não para popular.
 */
@Schema({ _id: false, versionKey: false })
export class AnulacaoNaProva extends Anulacao {
  @Prop({ type: String, required: true })
  @ApiProperty()
  provaId: string;

  @Prop({ type: Number, required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  numero: number | null;
}

export const AnulacaoNaProvaSchema =
  SchemaFactory.createForClass(AnulacaoNaProva);
