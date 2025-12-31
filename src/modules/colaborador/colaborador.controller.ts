import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ColaboradorService } from './colaborador.service';
import { SaveAfinidadesDTOInput } from './dtos/save-afinidades.dto.input';

@ApiTags('Colaborador')
@Controller('v1/colaborador')
export class ColaboradorController {
  constructor(private readonly service: ColaboradorService) {}

  @Get(':colaboradorId/afinidades')
  @ApiResponse({
    status: 200,
    description: 'Afinidades do colaborador ou null se não existir',
  })
  async getAfinidades(@Param('colaboradorId') colaboradorId: string) {
    return await this.service.getAfinidades(colaboradorId);
  }

  @Put('afinidades')
  @ApiResponse({
    status: 200,
    description: 'Salva/Atualiza afinidades (cria colaborador se não existir)',
  })
  async saveAfinidades(@Body() dto: SaveAfinidadesDTOInput) {
    return await this.service.saveAfinidades(dto);
  }

  @Delete(':colaboradorId/afinidades/:frenteId')
  @ApiResponse({
    status: 200,
    description: 'Remove afinidade específica',
  })
  async removeAfinidade(
    @Param('colaboradorId') colaboradorId: string,
    @Param('frenteId') frenteId: string,
  ) {
    return await this.service.removeAfinidade(colaboradorId, frenteId);
  }

  @Get('frente/:frenteId')
  @ApiResponse({
    status: 200,
    description: 'Busca colaboradores que tem afinidade com a frente',
  })
  async findByFrente(@Param('frenteId') frenteId: string) {
    return await this.service.findByFrente(frenteId);
  }

  @Get('materia/:materiaId')
  @ApiResponse({
    status: 200,
    description: 'Busca colaboradores que tem afinidade com a matéria',
  })
  async findByMateria(@Param('materiaId') materiaId: string) {
    return await this.service.findByMateria(materiaId);
  }
}
