import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * O recorte de um relatório, no CORPO.
 *
 * ⚠️ **Existe porque a lista de usuários não cabe numa query string.** Um UUID
 * ocupa 36 caracteres, e uma turma de 50 estudantes já passa de 2.300 — acima
 * do limite seguro de URL. O corpo é o único lugar onde uma lista de tamanho
 * arbitrário cabe.
 *
 * ⚠️ E o motivo de existir a lista, em vez do `turmaId` que as rotas GET usam:
 * o `turmaId` gravado na junção é uma FOTO do momento do upload e nunca é
 * atualizado. Estudante que entrou na turma depois de enviar o cartão sumia do
 * recorte — ou pior, aparecia como "não enviou" no relatório por turma, que
 * AFIRMA algo falso. Ver o card 18.
 */
export class ConsultarRelatorioDtoBody {
  /**
   * OBRIGATÓRIO de propósito. Opcional aqui, a rota viraria "todas as linhas
   * deste simulado" e qualquer chamador enxergaria todos os cursinhos.
   */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cursinhoId: string;

  /**
   * Os estudantes do recorte — a turma **atual**, resolvida pelo chamador.
   *
   * ⚠️ **Ausente significa "o cursinho inteiro"**, que é o relatório geral.
   * Já um array VAZIO significaria "nenhum estudante", e o resultado correto
   * seria vazio — por isso `@ArrayNotEmpty()`: mandar `[]` quase sempre é bug
   * de quem chama (uma turma sem ninguém), e devolver o cursinho inteiro nesse
   * caso seria o oposto do pedido.
   */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  usuarios?: string[];
}
