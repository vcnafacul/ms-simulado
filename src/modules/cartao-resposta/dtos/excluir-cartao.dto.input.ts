import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExcluirCartaoDtoInput {
  /**
   * ⚠️ **No corpo, nunca no caminho** — mesmo motivo do
   * `ReprocessarCartaoDtoInput`: é o cursinho resolvido do JWT na api.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;

  /** Quem excluiu (userId do JWT). Vai para a auditoria. */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  excluidoPor: string;
}
