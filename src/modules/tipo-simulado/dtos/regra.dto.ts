import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { FrenteExist } from 'src/modules/frente/validator/frente-exist.validator';
import { MateriaExist } from 'src/modules/materia/validator/materia-exist.validator';
import { Caderno } from 'src/modules/questao/enums/caderno.enum';

export class RegraDTO {
  @ApiProperty()
  @IsString()
  @MateriaExist({ message: 'materia não existe' })
  materia: string;

  @ApiProperty()
  @IsNumber()
  quantidade: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @FrenteExist({ message: 'frente não existe' })
  frente?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  ano?: number;

  @ApiProperty({ enum: Caderno, required: false })
  @IsEnum(Caderno)
  @IsOptional()
  public caderno: Caderno;
}
