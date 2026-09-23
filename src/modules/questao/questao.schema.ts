import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { Frente } from '../frente/frente.schema';
import { Materia } from '../materia/materia.schema';
import { Alternativa } from './enums/alternativa.enum';
import { EnemArea } from './enums/enem-area.enum';
import { Status } from './enums/status.enum';
import { QuestaoReview } from './questao.review.schema';
import { TipoOrigem } from './enums/tipo-origem.enum';

@Schema({ timestamps: true, versionKey: false })
export class Questao extends QuestaoReview {
  @Prop()
  @ApiProperty({ enum: EnemArea })
  public enemArea: EnemArea;

  @Prop({ ref: Frente.name, type: Types.ObjectId })
  @ApiProperty()
  public frente1: Frente;

  @Prop({ ref: Frente.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public frente2: Frente = null;

  @Prop({ ref: Frente.name, type: Types.ObjectId, required: false })
  @ApiProperty()
  public frente3: Frente = null;

  @Prop({ ref: Materia.name, type: Types.ObjectId })
  @ApiProperty()
  public materia: Materia;

  // Âncora da prova de origem (renomeada de `prova` na migração 0002). String
  // (id hex), não populada: serve pra casar com `provasContendo` no dash e obter
  // prova+número. O número não vive mais na questão — vem do relacionamento.
  @Prop({ type: String, required: false, default: null })
  @ApiProperty({ required: false, nullable: true })
  public provaBase?: string | null;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoQuestao: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public pergunta: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaA: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaA: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaB: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaB: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaC: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaC: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaD: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaD: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public textoAlternativaE: string;

  @Prop({ required: false, default: '' })
  @ApiProperty()
  public imageAlternativaE: string;

  @Prop({ select: false })
  public alternativa: Alternativa;

  @Prop()
  @ApiProperty()
  public imageId: string;

  @Prop({ required: false })
  @ApiProperty()
  public acertos: number;

  @Prop({ required: false })
  @ApiProperty()
  public quantidadeSimulado: number;

  @Prop({ required: false })
  @ApiProperty()
  public quantidadeResposta: number;

  @Prop({ required: false, default: Status.Pending, enum: Status })
  @ApiProperty()
  public status: Status;

  @Prop({ required: false, default: [], type: [String] })
  @ApiProperty()
  public files: string[];

  @Prop({ required: false, default: 'plain', enum: ['plain', 'markdown'] })
  @ApiProperty({ enum: ['plain', 'markdown'], default: 'plain' })
  public contentFormat: string;

  @Prop({ required: false, default: [], type: [String] })
  @ApiProperty()
  public assets: string[];

  /**
   * De qual questão esta nasceu — o lastro da duplicação (card 25).
   *
   * ⚠️ **`null` na esmagadora maioria**: só quem veio de `POST /duplicar` tem.
   *
   * ⚠️ **String, e não `ref`**, pelo mesmo motivo do `provaBase` acima: o
   * consumidor quer o id para montar link e casar com listagem, não o
   * documento inteiro populado dentro de cada questão.
   *
   * ⚠️ **A original apagada NÃO limpa este campo**, e é deliberado: a cópia
   * continua existindo e o front mostra "Copiada de [questão excluída]".
   * Perder o lastro seria perder a única pista de onde ela veio.
   *
   * ---
   *
   * ⚠️ **NÃO existe um `copias[]` ao lado, e isso é decisão contra o doc 10 da
   * discussion #61.** Uma lista denormalizada de filhas é exatamente o padrão
   * que os cards 21 e 22 mostraram que erra: medido em homologação, **0 de 181**
   * questões tinham os contadores incrementais batendo com o histórico.
   *
   * As filhas são derivadas por `find({ origem: id })`, com índice — uma
   * consulta barata que **não pode divergir**, porque não há segunda cópia da
   * verdade para sincronizar.
   *
   * ⚠️ **A linhagem é guardada só em UM nível (pai direto).** A cadeia completa
   * é derivável subindo por `origem`, e é assim que o card 29 vai somar a
   * família. Guardar a raiz junto criaria um segundo campo a manter em acordo
   * com o primeiro.
   */
  @Prop({ type: String, required: false, default: null, index: true })
  @ApiProperty({ required: false, nullable: true })
  public origem?: string | null;

  /**
   * O que esta questão é em relação à `origem`: cópia ou versão (card 32).
   *
   * ⚠️ **É atributo do vínculo, não uma segunda relação.** Não existe um
   * `versaoDe` ao lado de `origem` — dois campos para a mesma relação saem de
   * acordo no primeiro caminho que escrever um e esquecer o outro. Aqui o
   * vínculo continua sendo só `origem`; o tipo diz o que ele significa.
   *
   * ⚠️ **Ausente com `origem` preenchida = `copia`.** É o dado anterior ao card
   * 32, e cópia é o tipo que não afirma nada sobre histórico anterior — ler
   * como versão faria a tela dizer "o histórico ficou com a versão anterior"
   * sobre uma questão que talvez não tenha nenhuma.
   *
   * Escrito em um lugar só: `documentoDaCopia`, que exige o tipo.
   */
  @Prop({
    type: String,
    enum: Object.values(TipoOrigem),
    required: false,
    default: null,
  })
  @ApiProperty({ required: false, nullable: true, enum: TipoOrigem })
  public tipoOrigem?: TipoOrigem | null;

  /**
   * A questão parou de aceitar edição de conteúdo (card 26).
   *
   * ⚠️ **É o que torna o enunciado do histórico confiável sem copiar nada.** A
   * alternativa era guardar o texto em cada cartão — medido no card 23: 860 B
   * de conteúdo × 54 questões = ~46 KB por cartão contra 5,5 KB, e os 500
   * cartões do mesmo simulado copiariam o MESMO texto 500 vezes. Se a questão
   * que o histórico aponta é imutável, o enunciado está garantido de graça.
   *
   * ⚠️ **Congela só o CONTEÚDO.** Matéria e frente não mudam o que o aluno leu,
   * e reclassificar uma questão antiga é trabalho legítimo de catálogo — o
   * `updateClassificacao` continua aceito. Quem mexer nisso precisa saber que a
   * distinção é deliberada.
   *
   * ⚠️ **Só quem já foi respondida chega aqui.** Questão sem resposta é
   * rascunho: edita in-place, sem cerimônia e sem sucessora.
   */
  @Prop({ type: Boolean, required: false, default: false })
  @ApiProperty({ required: false })
  public congelada?: boolean;
}

export const QuestaoSchema = SchemaFactory.createForClass(Questao);
