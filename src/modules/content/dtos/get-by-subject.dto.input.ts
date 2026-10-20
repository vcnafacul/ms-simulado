import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { StatusContent } from '../enums/status-content.enum';

/**
 * Querystring de `GET v1/content/subject/:subjectId`.
 *
 * ⚠️ A api sempre mandou `?status=1` nesta rota (é a página do tema que o
 * aluno vê), mas o controller só lia o `@Param` e o parâmetro morria aqui:
 * o aluno via material pendente de validação, rejeitado e demanda resetada
 * com o arquivo antigo. Este DTO é o que faz o filtro existir.
 *
 * ⚠️ `@Type(() => Number)` porque o querystring chega como texto e o
 * `ValidationPipe` global não tem `enableImplicitConversion`: sem ele,
 * `@IsEnum` recusaria `"1"` e a página do tema ficaria vazia.
 */
export class GetBySubjectDtoInput {
  @ApiProperty({ enum: StatusContent, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(StatusContent, { message: 'status inválido' })
  status?: StatusContent;
}
