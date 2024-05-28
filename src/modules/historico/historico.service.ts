import { Injectable } from '@nestjs/common';
import { GetHistoricoDTOInput } from './dtos/get-historico.dto';
import { HistoricoRepository } from './historico.repository';

@Injectable()
export class HistoricoService {
  constructor(private repository: HistoricoRepository) {}

  async getAllbyUser(dto: GetHistoricoDTOInput) {
    return await this.repository.getAllByUser(dto);
  }

  async getById(id: string) {
    return await this.repository.getById(id);
  }
}
