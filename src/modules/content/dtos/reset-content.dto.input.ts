import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Body de `PATCH v1/content/:id/reset`.
 *
 * ⚠️ A api sempre mandou `{ userId }` aqui, e o controller não lia o body:
 * o `AuditLog` do reset saía sem usuário.
 */
export class ResetContentDtoInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;
}
