import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Content } from '../content/content.schema';

export enum TipoFileContent {
  Documento = 'documento',
  Video = 'video',
}

/** Id de vídeo do YouTube: 11 caracteres. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * O que foi enviado para uma demanda: um documento (`.docx` no R2, `fileKey`)
 * ou um vídeo do YouTube (`videoId`). Nunca os dois.
 *
 * ⚠️ O nome ficou `FileContent` por ser o que `Content.file`, a proposta e o
 * histórico já apontam; renomear seria refactor sem ganho. O tipo do CONTEÚDO
 * é o tipo do seu `FileContent` vigente (tickets/049).
 */
@Schema({ timestamps: false, versionKey: false })
export class FileContent extends BaseSchema {
  @Prop({ enum: TipoFileContent, default: TipoFileContent.Documento })
  @ApiProperty({ enum: TipoFileContent })
  public tipo: TipoFileContent;

  @Prop({
    required: function (this: FileContent) {
      return this.tipo !== TipoFileContent.Video;
    },
  })
  @ApiProperty({ required: false })
  public fileKey?: string;

  @Prop({ required: false })
  @ApiProperty({ required: false })
  public originalName?: string;

  @Prop({
    required: function (this: FileContent) {
      return this.tipo === TipoFileContent.Video;
    },
    match: VIDEO_ID,
  })
  @ApiProperty({ required: false })
  public videoId?: string;

  @Prop({ ref: Content.name, type: Types.ObjectId })
  @ApiProperty()
  public content: Content;

  @Prop()
  @ApiProperty()
  public uploadedBy: string;
}

export const FileContentSchema = SchemaFactory.createForClass(FileContent);

// Vídeo com arquivo junto é erro de quem chamou, não dado válido.
FileContentSchema.pre('validate', function (next) {
  if (
    this.tipo === TipoFileContent.Video &&
    (this.fileKey || this.originalName)
  ) {
    return next(new Error('vídeo não tem arquivo (fileKey/originalName)'));
  }
  next();
});
