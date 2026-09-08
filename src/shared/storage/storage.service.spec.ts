import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageService, StorageError } from './storage.service';

const s3Mock = mockClient(S3Client);

function makeService() {
  const env = {
    get: (k: string) =>
      ({
        AWS_ENDPOINT: 'http://localhost:9000',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'x',
        AWS_SECRET_ACCESS_KEY: 'y',
        CARTAO_BUCKET: 'vcnafacul-cartoes',
      })[k],
  };
  return new StorageService(env as any);
}

describe('StorageService', () => {
  beforeEach(() => s3Mock.reset());

  it('exists → true quando HeadObject responde', async () => {
    s3Mock.on(HeadObjectCommand).resolves({});
    await expect(makeService().exists('templates/1/cartao.pdf')).resolves.toBe(
      true,
    );
  });

  it('exists → false quando NotFound', async () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects(Object.assign(new Error('NotFound'), { name: 'NotFound' }));
    await expect(makeService().exists('templates/1/cartao.pdf')).resolves.toBe(
      false,
    );
  });

  it('get → Buffer com os bytes', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: {
        transformToByteArray: async () => new TextEncoder().encode('pdf'),
      } as any,
    });
    const buf = await makeService().get('templates/1/cartao.pdf');
    expect(buf.toString()).toBe('pdf');
  });

  it('get → StorageError em falha', async () => {
    s3Mock
      .on(GetObjectCommand)
      .rejects(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    await expect(makeService().get('templates/1/x')).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it('putObject → envia PutObject com Key/ContentType', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await makeService().putObject(
      'templates/1/template.json',
      '{"a":1}',
      'application/json',
    );
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({
      Bucket: 'vcnafacul-cartoes',
      Key: 'templates/1/template.json',
      ContentType: 'application/json',
    });
  });
});

/**
 * O cartão-resposta é a rede de segurança desta mudança: ele chama
 * `get`/`exists`/`putObject` sem bucket e não pode nem perceber que o
 * parâmetro existe.
 */
describe('StorageService — bucket opcional', () => {
  const env = {
    get: (chave: string) =>
      ({
        AWS_ENDPOINT: 'http://localhost:9000',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'k',
        AWS_SECRET_ACCESS_KEY: 's',
        CARTAO_BUCKET: 'bucket-do-cartao',
      })[chave],
  } as any;

  const capturarBucket = (service: StorageService) => {
    const enviados: string[] = [];
    (service as any).client = {
      send: (comando: any) => {
        enviados.push(comando.input.Bucket);
        return Promise.resolve({
          Body: { transformToByteArray: async () => new Uint8Array([1]) },
        });
      },
    };
    return enviados;
  };

  it('sem bucket, usa o CARTAO_BUCKET', async () => {
    const service = new StorageService(env);
    const enviados = capturarBucket(service);
    await service.get('k1');
    await service.exists('k2');
    await service.putObject('k3', Buffer.from('x'), 'image/png');
    expect(enviados).toEqual([
      'bucket-do-cartao',
      'bucket-do-cartao',
      'bucket-do-cartao',
    ]);
  });

  it('com bucket, usa o que foi passado', async () => {
    const service = new StorageService(env);
    const enviados = capturarBucket(service);
    await service.get('k1', 'outro-bucket');
    await service.putObject(
      'k2',
      Buffer.from('x'),
      'image/png',
      'outro-bucket',
    );
    expect(enviados).toEqual(['outro-bucket', 'outro-bucket']);
  });
});
