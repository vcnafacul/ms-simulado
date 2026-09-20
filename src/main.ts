import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { VALIDATION_PIPE_OPTIONS } from './config/validation-pipe.config';
import { document } from './config/swagger.config';
import { ValidationPipe } from '@nestjs/common';
import { useContainer } from 'class-validator';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * ⚠️ **Sem isto o limite é o default do Express: 100 kb.**
   *
   * O `POST v1/caderno/:simuladoId` recebe os logos do caderno em base64 no
   * corpo — a api-vcnafacul os manda porque o ms não tem como buscá-los (a
   * chave do logo do cursinho mora no MySQL e depende de quem pediu). Base64
   * infla ~33%, então o teto efetivo eram **~73 kb de logo somados**: um PNG
   * de 75 kb sozinho já devolvia `413 request entity too large`.
   *
   * ⚠️ O erro chegava ao usuário com o path da API (`/mssimulado/caderno/…`),
   * parecendo problema do download. Não era: o download nem chegava a começar.
   *
   * 30mb espelha o que a `api-vcnafacul` já usa (`main.ts`). Os dois serviços
   * só conversam entre si, e tinham limites em ordens de grandeza diferentes
   * sem ninguém ter decidido isso.
   *
   * ⚠️ Isto é a folga, **não** o conserto: quem impede o corpo de crescer é o
   * teto de dimensão aplicado no logo do lado da api.
   */
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ limit: '30mb', extended: true }));
  // ⚠️ UM pipe global, e só um. Havia um `new ValidationPipe()` sem opções
  // registrado logo abaixo deste: `useGlobalPipes` acumula, então os dois
  // rodavam por requisição. O que depende desta configuração está no docblock
  // de `VALIDATION_PIPE_OPTIONS`.
  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  SwaggerModule.setup('api', app, document(app));
  const port = process.env.MS_PORT ?? process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 MS-Simulado rodando em: http://localhost:${port}`);
  console.log(`📃 Swagger: http://localhost:${port}/api`);
}
bootstrap();
