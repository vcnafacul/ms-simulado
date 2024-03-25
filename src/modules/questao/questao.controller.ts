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
import { CreateQuestaoDTOInput } from './dtos/create.dto.input';
import { UpdateDTOInput } from './dtos/update.dto.input';
import { Status } from './enums/status.enum';
import { Questao } from './questao.schema';
import { QuestaoService } from './questao.service';

@ApiTags('Questao')
@Controller('v1/questao')
export class QuestaoController {
  constructor(private readonly service: QuestaoService) {}

  @Get('infos')
  @ApiResponse({
    status: 200,
    description: 'exame cadastrados e valido',
    type: Questao,
    isArray: true,
  })
  //precisamos criar dto pra isso
  public async getInfos(): Promise<any> {
    return await this.service.getInfos();
  }

  @Get(':status')
  @ApiResponse({
    status: 200,
    description: 'get gestões por status',
    type: Questao,
    isArray: true,
  })
  public async getAll(
    @Param('status') status: Status,
    @Query() query: GetAllDtoInput,
  ): Promise<GetAllDtoOutput<Questao>> {
    return await this.service.getAll(query, status);
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'cadastro de questao',
    type: Questao,
    isArray: false,
  })
  public async post(@Body() model: CreateQuestaoDTOInput): Promise<Questao> {
    return await this.service.create(model);
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'buscar questão por id',
    type: Questao,
    isArray: false,
  })
  public async getById(@Param('id') id: string): Promise<Questao> {
    return await this.service.getById(id);
  }

  @Delete(':id')
  public async delete(@Param('id') id: string): Promise<void> {
    return await this.service.delete(id);
  }

  @Patch(':id/:status')
  public async updateStatus(
    @Param('id') id: string,
    @Param('status') status: Status,
    @Body() body: { message: string; userId: number },
  ) {
    await this.service.updateStatus(id, status, body.userId, body.message);
  }

  @Patch()
  @ApiResponse({
    status: 200,
    description: 'update questao',
    type: Questao,
    isArray: false,
  })
  public async updateQuestion(@Body() question: UpdateDTOInput) {
    await this.service.updateQuestion(question);
  }
}
