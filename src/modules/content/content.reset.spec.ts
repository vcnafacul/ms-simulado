import { ValidationPipe } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { VALIDATION_PIPE_OPTIONS } from 'src/config/validation-pipe.config';
import { AuditLogService } from '../auditLog/auditLog.service';
import {
  FileContent,
  FileContentSchema,
} from '../file-content/file-content.schema';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Subject, SubjectSchema } from '../questao/subject/subject.schema';
import { ContentRepository } from './content.repository';
import { Content, ContentSchema } from './content.schema';
import { ContentService } from './content.service';
import { ResetContentDtoInput } from './dtos/reset-content.dto.input';
import { StatusContent } from './enums/status-content.enum';
import { SnapshotContentStatusRepository } from './snapshot/snapshot-content-status.repository';

/**
 * Reset = demanda volta a aguardar envio SEM arquivo vigente, e o log diz
 * quem resetou.
 *
 * ⚠️ Mongo real, porque a armadilha é do driver: `content.file = undefined`
 * seguido de `updateOne(filtro, content)` não remove nada (o Mongoose
 * descarta `undefined`). Só um banco de verdade mostra se o `$unset` chegou.
 */
describe('reset da demanda — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let service: ContentService;
  let model: Model<Content>;
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Content.name, schema: ContentSchema },
          { name: Subject.name, schema: SubjectSchema },
          { name: Frente.name, schema: FrenteSchema },
          { name: FileContent.name, schema: FileContentSchema },
        ]),
      ],
      providers: [
        ContentService,
        ContentRepository,
        { provide: SnapshotContentStatusRepository, useValue: {} },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
    service = mod.get(ContentService);
    model = mod.get(getModelToken(Content.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    auditLog.create.mockClear();
    await model.deleteMany({});
  });

  const aprovadaComArquivo = async () =>
    model.create({
      title: 'Funções',
      status: StatusContent.Approved,
      subject: String(new Types.ObjectId()),
      userId: 'criador',
      order: 0,
      file: new Types.ObjectId(),
      lastEditedBy: 'autor',
    });

  it('⚠️ tira o arquivo NO BANCO e volta para "aguardando envio"', async () => {
    const demanda = await aprovadaComArquivo();

    await service.reset(String(demanda._id), 'revisor');

    const noBanco = await model.findById(demanda._id).lean();
    expect(noBanco.status).toBe(StatusContent.Pending_Upload);
    expect(noBanco).not.toHaveProperty('file');
  });

  it('mantém quem fez o material (lastEditedBy) — o histórico é dele', async () => {
    const demanda = await aprovadaComArquivo();

    await service.reset(String(demanda._id), 'revisor');

    const noBanco = await model.findById(demanda._id).lean();
    expect(noBanco.lastEditedBy).toBe('autor');
  });

  it('grava no AuditLog quem resetou', async () => {
    const demanda = await aprovadaComArquivo();

    await service.reset(String(demanda._id), 'revisor');

    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'revisor',
        entityId: String(demanda._id),
        entityType: 'Content',
      }),
    );
  });

  it('demanda inexistente → 404, sem log', async () => {
    await expect(
      service.reset(String(new Types.ObjectId()), 'revisor'),
    ).rejects.toMatchObject({ status: 404 });
    expect(auditLog.create).not.toHaveBeenCalled();
  });
});

describe('ResetContentDtoInput pelo pipe global', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const meta = { type: 'body', metatype: ResetContentDtoInput } as any;

  it('⚠️ o userId que a api manda chega ao controller (antes o body era ignorado)', async () => {
    const out = await pipe.transform({ userId: 'u1' } as any, meta);

    expect(out.userId).toBe('u1');
  });

  it('body vazio passa (chamador antigo sem userId)', async () => {
    const out = await pipe.transform({} as any, meta);

    expect(out.userId).toBeUndefined();
  });
});
