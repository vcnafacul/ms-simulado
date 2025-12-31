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
import { Content } from './content.schema';
import { ContentService } from './content.service';
import { CreateContentDTOInput } from './dtos/create.dto.input';
import { MovePositionDTOInput } from './dtos/move-position.dto.input';
import { SwapOrderDTOInput } from './dtos/swap-order.dto.input';
import { UploadFileDTOInput } from './dtos/upload-file.dto.input';
import { FileContent } from './file-content/file-content.schema';

@ApiTags('Conteúdos')
@Controller('v1/content')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: 'conteúdos cadastrados e válidos',
    type: Content,
    isArray: true,
  })
  public async getAll(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Content>> {
    return await this.service.getAll(query);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastrado com sucesso',
    type: Content,
    isArray: false,
  })
  public async post(@Body() model: CreateContentDTOInput): Promise<Content> {
    return await this.service.add(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'conteúdo cadastrado e válido',
    type: Content,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Content> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }

  @Post('file')
  @ApiResponse({
    status: 200,
    description: 'arquivo cadastrado com sucesso',
    type: FileContent,
    isArray: false,
  })
  public async uploadFile(
    @Body() model: UploadFileDTOInput,
  ): Promise<FileContent> {
    return await this.service.uploadFile(model);
  }

  @Get('file')
  @ApiResponse({
    status: 200,
    description: 'arquivos cadastrados',
    type: FileContent,
    isArray: true,
  })
  public async getAllFiles(
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<FileContent>> {
    return await this.service.getAllFiles(query);
  }

  @Get('file/:id')
  @ApiResponse({
    status: 200,
    description: 'arquivo cadastrado',
    type: FileContent,
    isArray: false,
  })
  public async getFileById(@Param('id') id: string): Promise<FileContent> {
    return await this.service.getFileById(id);
  }

  @Delete('file/:id')
  public async deleteFile(@Param('id') id: string): Promise<void> {
    return await this.service.deleteFile(id);
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
    description: 'Content movido para nova posição',
  })
  public async moveToPosition(
    @Param('id') id: string,
    @Body() model: MovePositionDTOInput,
  ): Promise<void> {
    return await this.service.moveToPosition(
      id,
      model.position,
      model.subjectId,
    );
  }

  @Patch(':id/move-up')
  @ApiResponse({
    status: 200,
    description: 'Content movido uma posição acima',
  })
  public async moveUp(
    @Param('id') id: string,
    @Query('subjectId') subjectId: string,
  ): Promise<void> {
    return await this.service.moveUp(id, subjectId);
  }

  @Patch(':id/move-down')
  @ApiResponse({
    status: 200,
    description: 'Content movido uma posição abaixo',
  })
  public async moveDown(
    @Param('id') id: string,
    @Query('subjectId') subjectId: string,
  ): Promise<void> {
    return await this.service.moveDown(id, subjectId);
  }

  @Patch(':id/move-to-top')
  @ApiResponse({
    status: 200,
    description: 'Content movido para o topo',
  })
  public async moveToTop(
    @Param('id') id: string,
    @Query('subjectId') subjectId: string,
  ): Promise<void> {
    return await this.service.moveToTop(id, subjectId);
  }

  @Patch(':id/move-to-bottom')
  @ApiResponse({
    status: 200,
    description: 'Content movido para o fim',
  })
  public async moveToBottom(
    @Param('id') id: string,
    @Query('subjectId') subjectId: string,
  ): Promise<void> {
    return await this.service.moveToBottom(id, subjectId);
  }
}
