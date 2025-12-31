import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import { document } from './config/swagger.config';

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

  const port = process.env.MS_PORT || 3000;
  await app.listen(port);

  // Cores ANSI
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
  };

  const isDevelopment = process.env.NODE_ENV !== 'production';
  const apiUrl = `http://localhost:${port}`;
  const swaggerUrl = `${apiUrl}/api`;

  console.log('\n');
  console.log(
    `${colors.bright}${colors.green}🚀 API está rodando em:${colors.reset}`,
  );
  console.log(`${colors.cyan}   ${apiUrl}${colors.reset}`);

  if (isDevelopment) {
    console.log('\n');
    console.log(
      `${colors.bright}${colors.magenta}📚 Swagger disponível em:${colors.reset}`,
    );
    console.log(`${colors.yellow}   ${swaggerUrl}${colors.reset}`);
  }

  console.log('\n');
}
bootstrap();
