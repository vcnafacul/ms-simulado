import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

/**
 * O que é PERSISTIDO de uma falha: os dois fatos do que aconteceu.
 *
 * A descrição amigável e a `acaoSugerida` NÃO ficam aqui — são derivadas do
 * `codigo` na leitura (ver `../falha/mapa-falha.ts`). Gravá-las congelaria o
 * texto no instante da falha, e ajustar uma frase passaria a exigir migração.
 */
export class FalhaHistorico {
  @Prop()
  @ApiProperty()
  public codigo: string;

  /** Texto cru da origem — inclui o stderr do OMRChecker em `motor_falhou`. */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public detalhe?: string;
}
