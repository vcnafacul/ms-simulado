import { ApiProperty } from '@nestjs/swagger';
import { Categoria } from '../schemas/categoria.schema';

export class CategoriaOutputDTO extends Categoria {
  @ApiProperty()
  public simuladosCount: number;

  @ApiProperty()
  public provasCount: number;
}
