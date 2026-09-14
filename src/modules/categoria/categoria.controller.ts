import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateCategoriaDTOInput } from './dtos/create.dto.input';
import { CategoriaOutputDTO } from './dtos/categoria-output.dto';
import { Categoria, DONO_SYSTEM } from './schemas/categoria.schema';
import { CategoriaService } from './categoria.service';

@ApiTags('Categoria')
@Controller('v1/categoria')
export class CategoriaController {
  constructor(private readonly service: CategoriaService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: CategoriaOutputDTO,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
    /**
     * ⚠️ `@Query('dono')` avulso, e não campo do `GetAllDtoInput`. MEDIDO neste
     * projeto: com `transform: true`, o ValidationPipe instancia o DTO e os
     * inicializadores de classe entram sempre — um campo com default nunca
     * chega `undefined`, e o "não informado" deixaria de existir.
     */
    @Query('dono') dono?: string,
  ): Promise<GetAllDtoOutput<CategoriaOutputDTO>> {
    return await this.service.getAll(query, dono ?? DONO_SYSTEM);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastrado com sucesso',
    type: Categoria,
    isArray: false,
  })
  public async post(
    @Body() model: CreateCategoriaDTOInput,
    /**
     * ⚠️ Header, não corpo. O corpo é escrito pelo cliente; este header é
     * escrito pela api a partir do JWT. Um `dono` no corpo seria assinado pelo
     * próprio cursinho.
     */
    @Headers('x-dono') dono?: string,
  ): Promise<Categoria> {
    return await this.service.add(model, dono ?? DONO_SYSTEM);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'materias cadastradas e validas',
    type: CategoriaOutputDTO,
    isArray: false,
  })
  public async getById(
    @Param('id') id: string,
  ): Promise<CategoriaOutputDTO | null> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
