import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

export type StatusTemplate = 'rascunho' | 'publicada' | 'arquivada';

@Schema({ timestamps: true, versionKey: false })
export class CadernoTemplate extends BaseSchema {
  @Prop({ required: true })
  @ApiProperty()
  public versao: number;

  @Prop({ required: true, enum: ['rascunho', 'publicada', 'arquivada'] })
  @ApiProperty({ enum: ['rascunho', 'publicada', 'arquivada'] })
  public status: StatusTemplate;

  /** `'main.tex'` -> o texto inteiro. Só os dois da whitelist. */
  @Prop({ type: Map, of: String, required: true })
  @ApiProperty()
  public arquivos: Map<string, string>;

  @Prop({ required: true })
  @ApiProperty()
  public criadorId: string;

  @Prop({ default: null })
  @ApiProperty({ required: false })
  public publicadaEm?: Date | null;

  @Prop({ default: '' })
  @ApiProperty({ required: false })
  public notas: string;

  /** Preenchido quando o rascunho nasceu de uma restauração. */
  @Prop({ default: null })
  @ApiProperty({ required: false })
  public origemVersao?: number | null;
}

export const CadernoTemplateSchema =
  SchemaFactory.createForClass(CadernoTemplate);

CadernoTemplateSchema.index({ versao: 1 }, { unique: true });
CadernoTemplateSchema.index({ status: 1 });

// ⚠️ O parcial é o que garante NO MÁXIMO UM RASCUNHO. Sem o
// partialFilterExpression, `status` viraria único no mundo: uma só versão
// arquivada no banco inteiro. Tem spec própria porque é fácil de declarar
// errado e o erro só aparece na segunda escrita.
CadernoTemplateSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'rascunho' } },
);
