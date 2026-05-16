import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { document } from './config/swagger.config';
import { ValidationPipe } from '@nestjs/common';
import { useContainer } from 'class-validator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  app.useGlobalPipes(new ValidationPipe());
  SwaggerModule.setup('api', app, document(app));
  const port = process.env.MS_PORT ?? process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 MS-Simulado rodando em: http://localhost:${port}`);
  console.log(`📃 Swagger: http://localhost:${port}/api`);
}
bootstrap();
