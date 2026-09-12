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

  // Bucket das imagens de questão (Caderno · card 03). SEM default: um
  // default silencioso apontaria para o bucket errado, e a falha apareceria
  // como "imagem não encontrada" — o sintoma mais confuso possível.
  // Credencial de LEITURA APENAS neste bucket.
  QUESTAO_BUCKET: z.string().optional(),

  // ms-omr (Etapa 12 · A3)
  OMR_URL: z.string().url().default('http://localhost:8000'),

  // Caderno · card 04. Rascunho é ferramenta de quem monta a prova; liberar
  // isso por acidente em produção entregaria caderno de simulado incompleto.
  //
  // ⚠️ NÃO use `z.coerce.boolean()`: ele trata qualquer string não vazia como
  // `true`, inclusive `"false"` — desligar a flag em produção não desligaria
  // nada, e o defeito ficaria invisível até alguém baixar um caderno que não
  // devia existir.
  CADERNO_DRAFT_ENABLED: z
    .enum(['true', 'false'])
    .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;
