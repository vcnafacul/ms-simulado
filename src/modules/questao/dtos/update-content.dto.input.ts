import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Alternativa } from '../enums/alternativa.enum';

export class UpdateContentDTOInput {
  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  public textoQuestao: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  public pergunta?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaA: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaB: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaC: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaD: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  public textoAlternativaE: string;

  @ApiProperty({ enum: Alternativa })
  @IsEnum(Alternativa)
  public alternativa: Alternativa;

  @ApiProperty()
  @IsBoolean()
  public textClassification: boolean;

  @ApiProperty()
  @IsBoolean()
  public alternativeClassfication: boolean;

  @ApiProperty({ required: false, enum: ['plain', 'markdown'] })
  @IsOptional()
  @IsIn(['plain', 'markdown'])
  public contentFormat?: string;

  /**
   * Quem editou, quando o client manda.
   *
   * ⚠️ **Opcional, e é decisão** (card 24): o client ainda não manda este campo
   * nestas duas rotas, e exigi-lo agora quebraria a edição de questão até o
   * deploy do outro lado. O log existe para **medir a frequência** das edições,
   * e essa pergunta se responde sem o autor.
   *
   * ⚠️ Com `@IsOptional()`, o client pode passar a mandar depois **sem mudança
   * de contrato** — é o mesmo `userId` no corpo que o `adicionarEmProva` e o
   * `updateStatus` já usam.
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  public userId?: string;
}
