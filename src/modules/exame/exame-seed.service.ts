import { Injectable, OnModuleInit } from '@nestjs/common';
import { ExameRepository } from './exame.repository';
import { Exame } from './exame.schema';
import { Localizacao } from './enum/localizacao.enum';

@Injectable()
export class ExameSeedService implements OnModuleInit {
  constructor(private readonly repo: ExameRepository) {}

  async onModuleInit() {
    const exists = await this.repo.getByFilter({ nome: 'Personalizado' });
    if (!exists) {
      const exame = Object.assign(new Exame(), {
        nome: 'Personalizado',
        localizacao: Localizacao.BR,
      });
      await this.repo.create(exame);
    }
  }
}
