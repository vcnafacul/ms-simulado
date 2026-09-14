import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Exame } from '../../exame/exame.schema';

/**
 * Dono das categorias da plataforma.
 *
 * ⚠️ Sentinela, e NUNCA nulo. Num índice composto único, documento com o campo
 * ausente e documento com o campo nulo não são a mesma coisa em toda versão do
 * Mongo — e a diferença só aparece quando a segunda categoria de mesmo nome é
 * criada, em produção.
 */
export const DONO_SYSTEM = 'system';

@Schema({ timestamps: true, versionKey: false })
export class Categoria extends BaseSchema {
  // ⚠️ O `unique` saiu daqui: a unicidade agora é composta com `dono`, no
  // índice declarado no fim do arquivo.
  @Prop()
  @ApiProperty()
  public nome: string;

  @Prop()
  @ApiProperty()
  public duracao: number;

  @Prop({ required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  public quantidadeTotalQuestao: number | null;

  @Prop({ ref: Exame.name, type: Types.ObjectId, required: true })
  @ApiProperty()
  public exame: Exame;

  @Prop({ required: true, default: false })
  @ApiProperty({ default: false })
  public custom: boolean;

  @Prop({ required: true, default: true })
  @ApiProperty({ default: true })
  public selecionavel: boolean;

  @Prop({ required: true, default: DONO_SYSTEM })
  @ApiProperty({ default: DONO_SYSTEM })
  public dono: string;

  @Prop({ required: false, default: '' })
  @ApiProperty({ required: false, default: '' })
  public descricao: string;
}

export const CategoriaSchema = SchemaFactory.createForClass(Categoria);

/**
 * ⚠️ **Parcial de propósito.** `BaseRepository.delete` é SOFT delete
 * (`deleted: true`). Sem `partialFilterExpression`, o documento excluído
 * continua ocupando a chave única e o cursinho não consegue recriar uma
 * categoria que ele mesmo apagou — recebendo 409 por um registro invisível.
 *
 * ⚠️ `{ deleted: false }`, não `{ deleted: { $ne: true } }`: o Mongo não aceita
 * `$ne` em partialFilterExpression. `deleted` tem `default: false` no
 * `BaseSchema`, e a migração 0003 faz o backfill dos documentos antigos.
 *
 * ⚠️ `name` explícito. Sem ele o Mongo deriva do padrão de chaves e um segundo
 * índice parecido colide com `IndexKeySpecsConflict` — que, com `autoIndex`,
 * deixa a aplicação subir sem o índice, em silêncio.
 */
CategoriaSchema.index(
  { dono: 1, nome: 1 },
  {
    unique: true,
    partialFilterExpression: { deleted: false },
    name: 'dono_nome_unico',
  },
);
