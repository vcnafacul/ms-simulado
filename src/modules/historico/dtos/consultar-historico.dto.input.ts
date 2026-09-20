import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConsultarHistoricoDtoInput {
  /**
   * ⚠️ **OBRIGATÓRIO, e é o gate.** Sem ele a rota devolvia o histórico de
   * qualquer pessoa para qualquer usuário autenticado.
   *
   * O valor vem do JWT, na api — nunca do corpo nem de algo que o chamador
   * escolha. Ver `historico.service.ts` do `api-vcnafacul`.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  usuario: string;
}
