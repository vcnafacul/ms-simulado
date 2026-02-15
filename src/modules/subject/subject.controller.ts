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
import { GetAllDtoOutput } from 'src/shared/dtos/get-all.dto.output';
import { ChangeOrderDTOInput } from './dtos/change-order.dto.input';
import { CreateSubjectDTOInput } from './dtos/create-subject.dto.input';
import { GetAllSubjectDtoInput } from './dtos/get-all-subject.dto.input';
import { UpdateSubjectDTOInput } from './dtos/update-subject.dto.input';
import { Subject } from './subject.schema';
import { SubjectService } from './subject.service';

@ApiTags('Subject')
@Controller('v1/subject')
export class SubjectController {
  constructor(private readonly service: SubjectService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'lista de temas cadastrados',
    type: Subject,
    isArray: true,
  })
  async getAll(
    @Query() query: GetAllSubjectDtoInput,
  ): Promise<GetAllDtoOutput<Subject>> {
    return await this.service.getAll(query);
  }

  @Post()
  @ApiResponse({
    status: 201,
    description: 'tema criado com sucesso',
    type: Subject,
  })
  async post(@Body() model: CreateSubjectDTOInput): Promise<Subject> {
    return await this.service.add(model);
  }

  @Get('frente/:frenteId')
  @ApiResponse({
    status: 200,
    description: 'lista de temas por frente ordenados',
    type: Subject,
    isArray: true,
  })
  async getByFrente(@Param('frenteId') frenteId: string): Promise<Subject[]> {
    return await this.service.getByFrente(frenteId);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'tema por ID',
    type: Subject,
  })
  async getById(@Param('id') id: string): Promise<Subject> {
    return await this.service.getById(id);
  }

  @Patch(':id')
  @ApiResponse({
    status: 200,
    description: 'tema atualizado com sucesso',
  })
  async update(
    @Param('id') id: string,
    @Body() model: UpdateSubjectDTOInput,
  ): Promise<void> {
    return await this.service.update(id, model);
  }

  @Patch('order')
  @ApiResponse({
    status: 200,
    description: 'ordem do tema alterada com sucesso',
  })
  async changeOrder(@Body() model: ChangeOrderDTOInput): Promise<void> {
    return await this.service.changeOrder(model.subjectId, model.newOrder);
  }

  @Patch('swap-order')
  @ApiResponse({
    status: 200,
    description: 'ordem de dois temas trocada',
  })
  async swapOrder(
    @Body() body: { id1: string; id2: string },
  ): Promise<void> {
    return await this.service.swapOrder(body.id1, body.id2);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
