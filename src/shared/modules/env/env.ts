import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'homologation', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  MONGODB: z.string().default('mongodb://localhost:27017'),

  // Fila (Valkey Streams)
  QUEUE_DRIVER: z.enum(['redis', 'memory']).default('memory'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),

  // Cartão resposta — storage R2/S3 (Etapa 7 · Bloco 3)
  AWS_ENDPOINT: z.string().default('http://localhost:9000'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  CARTAO_BUCKET: z.string().default('vcnafacul-cartoes'),
});

export type Env = z.infer<typeof envSchema>;
