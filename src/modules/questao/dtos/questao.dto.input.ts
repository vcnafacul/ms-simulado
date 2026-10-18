import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsMongoId,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { Status } from '../enums/status.enum';

export const QUESTAO_SORT_COLUMNS = ['updatedAt'] as const;
export type QuestaoSortColumn = (typeof QUESTAO_SORT_COLUMNS)[number];

export const SORT_ORDER = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDER)[number];

/**
 * As flags de "Revisões necessárias" que o banco filtra (tickets/043, card 01).
 * ⚠️ `alternativeClassfication` é o nome do campo no schema (sic).
 */
export const REVISOES_FILTRAVEIS = [
  'provaClassification',
  'subjectClassification',
  'reported',
  'textClassification',
  'alternativeClassfication',
] as const;
export type RevisaoFiltravel = (typeof REVISOES_FILTRAVEIS)[number];
const LISTA_DE_REVISOES = new RegExp(
  `^(${REVISOES_FILTRAVEIS.join('|')})(,(${REVISOES_FILTRAVEIS.join('|')}))*$`,
);

export class QuestaoDTOInput extends GetAllDtoInput {
  @ApiProperty()
  @IsOptional()
  @IsNumberString()
  status?: Status | undefined;

  @ApiProperty({ default: '' })
  @IsString()
  materia: string = '';

  @ApiProperty({ default: '' })
  @IsString()
  frente: string = '';

  @ApiProperty({ default: '' })
  @IsString()
  prova: string = '';

  @ApiProperty({ default: '' })
  @IsString()
  enemArea: string = '';

  @ApiProperty()
  @IsString()
  @IsOptional()
  text: string = '';

  /** Só as sinalizadas para revisão (tickets/024, card 04). */
  @ApiProperty({ required: false, enum: ['true'] })
  @IsOptional()
  @IsIn(['true'])
  reported?: 'true';

  /** tickets/042, card 04: `todas` (padrão), `esconder` ou `somente` as anuladas. */
  @ApiProperty({ required: false, enum: ['todas', 'esconder', 'somente'] })
  @IsOptional()
  @IsIn(['todas', 'esconder', 'somente'])
  anulada?: 'todas' | 'esconder' | 'somente';

  /** tickets/043: questões das provas deste exame (via categoria da prova). */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId()
  exame?: string;

  /** tickets/043: questões das provas desta categoria. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsMongoId()
  categoria?: string;

  /**
   * tickets/043: flags de revisão separadas por vírgula; a questão precisa ter
   * TODAS ("e"), ex.: `textClassification,reported`.
   */
  @ApiProperty({ required: false, example: 'textClassification,reported' })
  @IsOptional()
  @Matches(LISTA_DE_REVISOES, {
    message: `revisoes aceita: ${REVISOES_FILTRAVEIS.join(', ')}`,
  })
  revisoes?: string;

  /** tickets/043: só as que NÃO têm imagem da questão (`imageId`). */
  @ApiProperty({ required: false, enum: ['true'] })
  @IsOptional()
  @IsIn(['true'])
  semImagem?: 'true';

  /** Coluna para ordenação. Ordena por "updatedAt" (padrão). */
  @ApiProperty({ enum: QUESTAO_SORT_COLUMNS, default: 'updatedAt' })
  @IsOptional()
  @IsIn(QUESTAO_SORT_COLUMNS)
  sortColumn?: QuestaoSortColumn = 'updatedAt';

  /** Direção da ordenação: "asc" (menor para maior) ou "desc" (maior para menor). */
  @ApiProperty({ enum: SORT_ORDER, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_ORDER)
  sortOrder?: SortOrder = 'desc';
}
