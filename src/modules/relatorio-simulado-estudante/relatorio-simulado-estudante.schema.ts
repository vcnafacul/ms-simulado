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
 *
 * O grão é o ESTUDANTE, não a tentativa: uma linha por estudante por simulado
 * por cursinho, sempre apontando para o `Historico` da tentativa ATUAL. Um
 * reenvio depois de uma falha de OCR cria um `Historico` novo — se a chave
 * fosse `{historico, cursinhoId}`, esse reenvio nasceria como uma segunda
 * linha e o estudante apareceria duas vezes no relatório (uma falha, uma
 * concluída). Por isso a unicidade é em `{simulado, cursinhoId, usuario}`,
 * e a escrita é um upsert (`registrar`), não uma criação.
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
  { simulado: 1, cursinhoId: 1, usuario: 1 },
  { unique: true },
);

/**
 * O card 04b agrupa por simulado filtrando só por `cursinhoId` (e opcionalmente
 * `turmaId`). Os três índices acima começam por `simulado`, e prefixo de índice
 * composto não serve a quem não filtra o prefixo. Este serve aos DOIS recortes:
 * o Mongo usa `{cursinhoId}` sozinho como prefixo deste.
 */
RelatorioSimuladoEstudanteSchema.index({ cursinhoId: 1, turmaId: 1 });
