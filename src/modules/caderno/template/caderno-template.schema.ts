import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

export type StatusTemplate = 'rascunho' | 'publicada' | 'arquivada';

@Schema({ timestamps: true, versionKey: false })
export class CadernoTemplate extends BaseSchema {
  @Prop({ required: true })
  @ApiProperty()
  public versao: number;

  @Prop({ required: true, enum: ['rascunho', 'publicada', 'arquivada'] })
  @ApiProperty({ enum: ['rascunho', 'publicada', 'arquivada'] })
  public status: StatusTemplate;

  /**
   * `'main.tex'` -> o texto inteiro. Só os dois da whitelist.
   *
   * ⚠️ **`type: Object`, NÃO `type: Map` — e isto é medido, não preferência.**
   * Mongoose 7.6.11 recusa chave com `.` em `type: Map`: o write lança
   * `CastError` (`Mongoose maps do not support keys that contain "."`) e o read
   * hidratado (`findOne().exec()`) devolve `arquivos` como **`undefined`**, em
   * silêncio — só o `.lean()` enxerga o campo. As chaves aqui são `main.tex` e
   * `preambulo.tex` **por construção**: são os `ALVOS` da whitelist em
   * `extrair-zip.ts`. Ou seja, com `Map` este campo nunca funciona, e falha
   * calada na leitura. Quem for "melhorar" o tipo de volta para `Map`: o
   * `caderno-template.schema.spec.ts` tem um teste de hidratação que fica
   * vermelho na hora.
   *
   * ⚠️ Como as chaves têm ponto, **nunca escreva com caminho pontilhado**: um
   * `$set: { 'arquivos.main.tex': ... }` criaria `{arquivos:{main:{tex:…}}}`
   * aninhado, em silêncio. Hoje não há nenhuma escrita assim — todas trocam o
   * documento inteiro, e o repositório proíbe `create`/`update`/`delete`
   * justamente para não abrir esse caminho. Quem escrever a próxima precisa
   * saber.
   */
  @Prop({ type: Object, required: true })
  @ApiProperty()
  public arquivos: Record<string, string>;

  @Prop({ required: true })
  @ApiProperty()
  public criadorId: string;

  @Prop({ default: null })
  @ApiProperty({ required: false })
  public publicadaEm?: Date | null;

  @Prop({ default: '' })
  @ApiProperty({ required: false })
  public notas: string;

  /** Preenchido quando o rascunho nasceu de uma restauração. */
  @Prop({ default: null })
  @ApiProperty({ required: false })
  public origemVersao?: number | null;
}

export const CadernoTemplateSchema =
  SchemaFactory.createForClass(CadernoTemplate);

// ⚠️ **TODO ÍNDICE DAQUI PARA BAIXO LEVA `name` EXPLÍCITO.** Não é estilo —
// é o que impede o índice de não existir. Medido contra `mongo:7`:
//
//   - o nome autogerado vem da CHAVE, não da opção: `{ status: 1 }` vira
//     `status_1` nas DUAS declarações abaixo, a simples e a parcial;
//   - o servidor recusa a segunda com `IndexKeySpecsConflict`: "An existing
//     index has the same name as the requested index";
//   - com `autoIndex` (o padrão do Mongoose, e como a app sobe), esse erro
//     **não aparece no boot**: a aplicação inicializa limpa e a coleção fica
//     só com `_id_`, `versao_1` e `status_1`. O parcial único simplesmente
//     não está lá, e dois `criarRascunho` concorrentes entram os dois.
//
// Quem for adicionar o quarto índice: nome obrigatório, e diferente dos três.
// Isto foi um bug de verdade, pego pelo `test/caderno-template.e2e-spec.ts`,
// depois de passar por spec, review e seis tasks — porque as specs conferiam
// a DECLARAÇÃO, e o que faltava era a CONSTRUÇÃO.
CadernoTemplateSchema.index({ versao: 1 }, { unique: true, name: 'versao_1' });

// ⚠️ `name: 'status_1'` é o nome que o Mongoose já geraria: mantê-lo evita
// derrubar e recriar o índice nos bancos que já o têm.
CadernoTemplateSchema.index({ status: 1 }, { name: 'status_1' });

// ⚠️ O parcial é o que garante NO MÁXIMO UM RASCUNHO. Sem o
// partialFilterExpression, `status` viraria único no mundo: uma só versão
// arquivada no banco inteiro. Tem spec própria porque é fácil de declarar
// errado e o erro só aparece na segunda escrita.
CadernoTemplateSchema.index(
  { status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'rascunho' },
    name: 'status_rascunho_unico',
  },
);
