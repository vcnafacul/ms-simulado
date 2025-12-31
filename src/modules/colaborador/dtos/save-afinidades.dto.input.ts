import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SaveAfinidadesDTOInput {
  @ApiProperty({ description: 'ID do colaborador na outra aplicação' })
  @IsString()
  @IsNotEmpty()
  colaboradorId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Array com IDs das frentes',
    type: [String],
    example: ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'],
  })
  @IsArray()
  @IsString({ each: true })
  frentesIds: string[];
}
