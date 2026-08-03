import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { Status } from '../enums/status.enum';

export const QUESTAO_SORT_COLUMNS = ['numero', 'updatedAt'] as const;
export type QuestaoSortColumn = (typeof QUESTAO_SORT_COLUMNS)[number];

export const SORT_ORDER = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDER)[number];

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

  /** Coluna para ordenação. Permitido: "numero" (legado) ou "updatedAt" (padrão). */
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
