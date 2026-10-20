import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { TipoFileContent, VIDEO_ID } from '../file-content.schema';

export class CreateFileContentDTOInput {
  @ApiProperty({
    enum: TipoFileContent,
    required: false,
    default: TipoFileContent.Documento,
  })
  @IsOptional()
  @IsEnum(TipoFileContent)
  tipo?: TipoFileContent;

  @ApiProperty({ required: false, description: 'obrigatório em documento' })
  @ValidateIf((o) => o.tipo !== TipoFileContent.Video)
  @IsString()
  @IsNotEmpty()
  fileKey?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  originalName?: string;

  @ApiProperty({
    required: false,
    description: 'obrigatório em vídeo (11 caracteres)',
  })
  @ValidateIf((o) => o.tipo === TipoFileContent.Video)
  @Matches(VIDEO_ID, { message: 'videoId inválido' })
  videoId?: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsString()
  uploadedBy: string;
}
