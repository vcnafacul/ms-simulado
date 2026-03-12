import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateFileContentDTOInput } from './dtos/create-file-content.dto.input';
import { FileContent } from './file-content.schema';
import { FileContentService } from './file-content.service';

@ApiTags('FileContent')
@Controller('v1/file-content')
export class FileContentController {
  constructor(private readonly service: FileContentService) {}

  @Post()
  @ApiResponse({
    status: 201,
    description: 'referência de arquivo criada com sucesso',
    type: FileContent,
  })
  async create(@Body() model: CreateFileContentDTOInput): Promise<FileContent> {
    return await this.service.create(model);
  }

  @Post('standalone')
  @ApiResponse({
    status: 201,
    description: 'referência de arquivo criada sem atualizar conteúdo',
    type: FileContent,
  })
  async createStandalone(
    @Body() model: CreateFileContentDTOInput,
  ): Promise<FileContent> {
    return await this.service.createStandalone(model);
  }

  @Get('content/:contentId')
  @ApiResponse({
    status: 200,
    description: 'arquivos por conteúdo',
    type: FileContent,
    isArray: true,
  })
  async getByContent(
    @Param('contentId') contentId: string,
  ): Promise<FileContent[]> {
    return await this.service.getByContent(contentId);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'arquivo por ID',
    type: FileContent,
  })
  async getById(@Param('id') id: string): Promise<FileContent> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }
}
