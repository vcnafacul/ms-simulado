import { ApiProperty } from '@nestjs/swagger';
import { Edicao } from '../enums/edicao.enum';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CategoriaExist } from 'src/modules/categoria/validator/categoria-exist.validator';

export class CreateProvaDTOInput {
  @ApiProperty({ enum: Edicao, required: false, default: Edicao.Regular })
  @IsEnum(Edicao)
  edicao: Edicao;

  @ApiProperty({ required: false })
  @IsNumber()
  aplicacao: number;

  @ApiProperty()
  @IsNumber()
  ano: number;

  @ApiProperty()
  @IsString()
  @CategoriaExist({ message: 'categoria não existe' })
  categoria: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiProperty()
  @IsOptional()
  gabarito?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nomeSimulado?: string;

  // Campo INTERNO: injetado pelo api-vcnafacul a partir do JWT (req.user.id),
  // não vem do cliente. Precisa de @IsString() para sobreviver ao whitelist do
  // ValidationPipe. Obrigatório em toda prova nova (oficial ou custom).
  @ApiProperty()
  @IsString()
  criadorId: string;

  // Campo INTERNO: injetado pelo api-vcnafacul (Card 03) a partir do Collaborator
  // do usuário. Não vem do cliente final. @IsOptional + @IsString para sobreviver
  // ao whitelist do ValidationPipe e aceitar ausência/null.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  cursinhoId?: string | null;
}
