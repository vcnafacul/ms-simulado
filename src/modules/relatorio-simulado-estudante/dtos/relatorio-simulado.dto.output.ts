import { ApiProperty } from '@nestjs/swagger';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { FalhaDescrita } from '../../historico/falha/mapa-falha';

export class FrenteDoEstudanteDtoOutput {
  @ApiProperty() id: string;
  @ApiProperty() nome: string;
  /** Fração de 0 a 1, como `aproveitamentoGeral` — a tela é quem formata. */
  @ApiProperty() aproveitamento: number;
}

export class MateriaDoEstudanteDtoOutput {
  @ApiProperty() id: string;
  @ApiProperty() nome: string;
  @ApiProperty() aproveitamento: number;
  @ApiProperty({ type: [FrenteDoEstudanteDtoOutput] })
  frentes: FrenteDoEstudanteDtoOutput[];
}

export class LinhaRelatorioDtoOutput {
  @ApiProperty() usuario: string;

  @ApiProperty({ required: false }) turmaId?: string;

  /** O card 07 usa para abrir o detalhe do estudante. */
  @ApiProperty() historicoId: string;

  @ApiProperty({ enum: HistoricoStatus }) status: HistoricoStatus;

  @ApiProperty({ required: false }) cartaoCode?: string;

  @ApiProperty({ required: false }) questoesRespondidas?: number;

  /**
   * Quantas questões o estudante acertou — o número absoluto.
   *
   * Cursinho conversa em acertos ("fiz 61 na primeira aplicação", "o corte de
   * Medicina ficou em 78"), e o percentual sozinho esconde o denominador: 58%
   * de 45 e 58% de 180 são confianças diferentes sobre o mesmo número.
   *
   * ⚠️ **Contado no servidor, nunca derivado** de `aproveitamentoGeral × total`
   * — a fração arredondada produz 44 onde o aluno fez 45.
   *
   * ⚠️ **AUSENTE, não zero**, quando não há leitura concluída ou quando o
   * histórico é anterior ao card 08. Zero é uma nota; ausência de medida não é.
   */
  @ApiProperty({ required: false }) acertos?: number;

  /**
   * AUSENTE, não zero, quando não há leitura concluída. Zero é uma nota;
   * ausência de leitura não é — iguais, a média do card 04 mente.
   */
  @ApiProperty({ required: false }) aproveitamentoGeral?: number;

  /**
   * Nota por matéria, com as frentes dentro. É o que responde "em QUÊ o aluno
   * foi mal" — a pergunta que o relatório não respondia e que decide o que o
   * coordenador faz na segunda-feira.
   *
   * ⚠️ **Opcional, e ausente nunca vira `[]`.** Histórico de antes do
   * `criaAproveitamento`, leitura não concluída, ou cartão em que nenhuma
   * questão casou com matéria: nos três a lista vazia faria a tela desenhar
   * barra em zero e afirmar que o aluno zerou TODAS as matérias. Ausência de
   * medida não é medida zero.
   */
  @ApiProperty({ required: false, type: [MateriaDoEstudanteDtoOutput] })
  aproveitamentoPorMateria?: MateriaDoEstudanteDtoOutput[];

  @ApiProperty({ required: false }) falha?: FalhaDescrita;
}

export class RelatorioSimuladoDtoOutput {
  @ApiProperty({ type: [LinhaRelatorioDtoOutput] })
  linhas: LinhaRelatorioDtoOutput[];

  /**
   * Denominador do rodapé do relatório por turma: "27 dos 30 cartões deste
   * simulado são desta turma". No relatório geral do cursinho é sempre igual
   * a `linhas.length`.
   *
   * Renomeado de `totalCartoesDoCursinhoNoSimulado` (revisão adversarial,
   * Fix 7): conta LINHAS da junção, e o índice único faz disso uma linha por
   * ESTUDANTE — um estudante que reenvia depois de uma falha continua
   * contando 1. A proporção é correta (numerador e denominador têm o mesmo
   * grão), só o nome antigo dizia "cartões" quando é gente.
   */
  @ApiProperty()
  totalEstudantesComCartaoNoCursinho: number;

  /**
   * Quantas questões o simulado tem — o denominador de `acertos`.
   *
   * ⚠️ **No topo, e não repetido em cada linha.** É propriedade do SIMULADO,
   * não do estudante: repeti-lo em 500 linhas seria dizer 500 vezes a mesma
   * coisa, e abriria a porta para duas linhas discordarem.
   *
   * ⚠️ **Vem do `Simulado`, não de `respostas.length`.** São iguais hoje (o
   * `processAnswer` mapeia sobre `simulado.questoes`), e "iguais hoje" é
   * exatamente o tipo de coisa que deixa de ser verdade sem ninguém notar.
   *
   * ⚠️ `0` quando o simulado não existe mais — a tela mostra só o percentual.
   */
  @ApiProperty()
  totalDeQuestoes: number;
}
