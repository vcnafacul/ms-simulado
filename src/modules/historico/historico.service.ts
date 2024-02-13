import { Injectable } from '@nestjs/common';
import { HistoricoRepository } from './historico.repository';

@Injectable()
export class HistoricoService {
  constructor(private repository: HistoricoRepository) {}

  async getAllbyUser(userId: number) {
    return await this.repository.getAllByUser(userId);
  }

  async getById(id: string) {
    return await this.repository.getById(id);
  }
}
