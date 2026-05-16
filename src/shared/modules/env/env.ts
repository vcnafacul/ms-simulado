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
});

export type Env = z.infer<typeof envSchema>;
