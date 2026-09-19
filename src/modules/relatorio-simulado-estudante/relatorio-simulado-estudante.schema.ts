import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { BaseSchema } from 'src/shared/base/base.schema';
import { Historico } from '../historico/historico.schema';
import { Simulado } from '../simulado/schemas/simulado.schema';

/**
 * A qual cursinho e turma uma resposta pertencia **no instante em que foi dada**.
 *
 * É uma junção, e não campos no `Historico`, porque o `Historico` é a relação
 * usuário ↔ simulado e vale para quem não tem cursinho nenhum. Ali, `cursinhoId: null`
 * seria ambíguo entre "esse usuário não tem cursinho" e "ainda não preenchemos".
 * Aqui, a ausência de linha tem um significado só.
 *
 * Só o fluxo de CARTÃO gera linha. Simulado resolvido digitalmente entra no
 * histórico pessoal e no relatório genérico, que esta série não toca.
 */
@Schema({ timestamps: false, versionKey: false })
export class RelatorioSimuladoEstudante extends BaseSchema {
  @Prop({ ref: Historico.name, type: Types.ObjectId, required: true })
  @ApiProperty()
  public historico: Historico;

  /** Duplicado: sem ele, filtrar por simulado exigiria um join antes do match. */
  @Prop({ ref: Simulado.name, type: Types.ObjectId, required: true })
  @ApiProperty()
  public simulado: Simulado;

  /** Duplicado: o card 04 precisa saber quem NÃO respondeu. */
  @Prop({ required: true })
  @ApiProperty()
  public usuario: string;

  @Prop({ required: true })
  @ApiProperty()
  public cursinhoId: string;

  /** Nulo para estudante sem turma — ele aparece no relatório geral e em nenhum de turma. */
  @Prop({ required: false })
  @ApiProperty({ required: false })
  public turmaId?: string;
}

export const RelatorioSimuladoEstudanteSchema = SchemaFactory.createForClass(
  RelatorioSimuladoEstudante,
);

RelatorioSimuladoEstudanteSchema.index({ simulado: 1, cursinhoId: 1 });
RelatorioSimuladoEstudanteSchema.index({ simulado: 1, turmaId: 1 });
RelatorioSimuladoEstudanteSchema.index(
  { historico: 1, cursinhoId: 1 },
  { unique: true },
);
