import { Controller, Get, Param } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContentFileHistoryService } from './content-file-history.service';
import { ContentFileHistory } from './content-file-history.schema';

@ApiTags('ContentFileHistory')
@Controller('v1/content-file-history')
export class ContentFileHistoryController {
  constructor(private readonly service: ContentFileHistoryService) {}

  @Get('content/:contentId')
  @ApiResponse({
    status: 200,
    description: 'historico de arquivos por conteudo',
    type: ContentFileHistory,
    isArray: true,
  })
  async getByContent(
    @Param('contentId') contentId: string,
  ): Promise<ContentFileHistory[]> {
    return await this.service.getByContent(contentId);
  }
}
