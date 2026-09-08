import { Injectable } from '@nestjs/common';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { EnvService } from '../modules/env/env.service';

export class StorageError extends Error {}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly env: EnvService) {
    this.client = new S3Client({
      endpoint: this.env.get('AWS_ENDPOINT'),
      region: this.env.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.env.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.env.get('AWS_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true, // MinIO em dev (coerente com Card 05)
    });
    this.bucket = this.env.get('CARTAO_BUCKET');
  }

  /**
   * O bucket de cada chamada. Omitido, cai no `CARTAO_BUCKET` — o único que
   * este serviço conhecia antes, e é o que garante zero regressão no
   * cartão-resposta.
   */
  private bucketDe(bucket?: string): string {
    return bucket ?? this.bucket;
  }

  async exists(key: string, bucket?: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketDe(bucket), Key: key }),
      );
      return true;
    } catch (err: any) {
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404)
        return false;
      throw new StorageError(
        `falha ao verificar ${key}: ${err?.name ?? 'erro'}`,
      );
    }
  }

  async get(key: string, bucket?: string): Promise<Buffer> {
    try {
      const resp = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketDe(bucket), Key: key }),
      );
      const bytes = await resp.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err: any) {
      throw new StorageError(`falha ao ler ${key}: ${err?.name ?? 'erro'}`);
    }
  }

  async putObject(
    key: string,
    body: Buffer | string,
    contentType: string,
    bucket?: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketDe(bucket),
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (err: any) {
      throw new StorageError(`falha ao gravar ${key}: ${err?.name ?? 'erro'}`);
    }
  }
}
