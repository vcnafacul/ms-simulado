import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetAllDtoInput } from 'src/shared/dtos/get-all.dto.input';
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { CreateSubjectDTOInput } from './dtos/create.dto.input';
import { MovePositionDTOInput } from './dtos/move-position.dto.input';
import { SwapOrderDTOInput } from './dtos/swap-order.dto.input';
import { Subject } from './subject.schema';
import { SubjectService } from './subject.service';

@ApiTags('Temas')
@Controller('v1/subject')
export class SubjectController {
  constructor(private readonly service: SubjectService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'subjects cadastrados e válidos',
    type: Subject,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Subject>> {
    return await this.service.getAll(query);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastrado com sucesso',
    type: Subject,
    isArray: false,
  })
  public async post(@Body() model: CreateSubjectDTOInput): Promise<Subject> {
    return await this.service.add(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'subject cadastrado e válido',
    type: Subject,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Subject> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }

  @Patch('swap-order')
  @ApiResponse({
    status: 200,
    description: 'Ordem trocada com sucesso',
  })
  public async swapOrder(@Body() model: SwapOrderDTOInput): Promise<void> {
    return await this.service.swapOrder(model.id1, model.id2);
  }

  @Patch(':id/move-to-position')
  @ApiResponse({
    status: 200,
    description: 'Subject movido para nova posição',
  })
  public async moveToPosition(
    @Param('id') id: string,
    @Body() model: MovePositionDTOInput,
  ): Promise<void> {
    return await this.service.moveToPosition(
      id,
      model.position,
      model.frenteId,
    );
  }

  @Patch(':id/move-up')
  @ApiResponse({
    status: 200,
    description: 'Subject movido uma posição acima',
  })
  public async moveUp(
    @Param('id') id: string,
    @Query('frenteId') frenteId: string,
  ): Promise<void> {
    return await this.service.moveUp(id, frenteId);
  }

  @Patch(':id/move-down')
  @ApiResponse({
    status: 200,
    description: 'Subject movido uma posição abaixo',
  })
  public async moveDown(
    @Param('id') id: string,
    @Query('frenteId') frenteId: string,
  ): Promise<void> {
    return await this.service.moveDown(id, frenteId);
  }

  @Patch(':id/move-to-top')
  @ApiResponse({
    status: 200,
    description: 'Subject movido para o topo',
  })
  public async moveToTop(
    @Param('id') id: string,
    @Query('frenteId') frenteId: string,
  ): Promise<void> {
    return await this.service.moveToTop(id, frenteId);
  }

  @Patch(':id/move-to-bottom')
  @ApiResponse({
    status: 200,
    description: 'Subject movido para o fim',
  })
  public async moveToBottom(
    @Param('id') id: string,
    @Query('frenteId') frenteId: string,
  ): Promise<void> {
    return await this.service.moveToBottom(id, frenteId);
  }
}
