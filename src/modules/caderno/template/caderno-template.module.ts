import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CadernoTemplateController } from './caderno-template.controller';
import {
  CadernoTemplate,
  CadernoTemplateSchema,
} from './caderno-template.schema';
import { CadernoTemplateRepository } from './caderno-template.repository';
import { CadernoTemplateService } from './caderno-template.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CadernoTemplate.name, schema: CadernoTemplateSchema },
    ]),
  ],
  controllers: [CadernoTemplateController],
  providers: [CadernoTemplateService, CadernoTemplateRepository],
  // ⚠️ Exportado porque o card 11 vai injetar o serviço no CadernoService
  // para montar o zip a partir do Mongo.
  exports: [CadernoTemplateService],
})
export class CadernoTemplateModule {}
