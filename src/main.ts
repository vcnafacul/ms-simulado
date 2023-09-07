import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { document } from './config/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  SwaggerModule.setup('api', app, document(app));
  await app.listen(3000);
}
bootstrap();
