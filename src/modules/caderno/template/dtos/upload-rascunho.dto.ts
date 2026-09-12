import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadRascunhoDto {
  // Campo INTERNO: injetado pelo api-vcnafacul a partir do JWT (req.user.id),
  // não vem do cliente. Mesmo padrão de prova/dtos/create.dto.input.ts.
  @ApiProperty()
  @IsString()
  criadorId: string;

  // ⚠️ Num multipart TODO campo chega como string. Nada de @IsNumber nem
  // @IsBoolean aqui sem @Type — hoje não há nenhum, e é para não aparecer.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notas?: string;
}
