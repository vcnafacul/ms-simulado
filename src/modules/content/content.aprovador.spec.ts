import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../auditLog/auditLog.service';
import { ContentFileHistoryService } from '../content-file-history/content-file-history.service';
import {
  FileContent,
  FileContentSchema,
} from '../file-content/file-content.schema';
import { FileContentRepository } from '../file-content/file-content.repository';
import { FileContentService } from '../file-content/file-content.service';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Subject, SubjectSchema } from '../questao/subject/subject.schema';
import { ContentRepository } from './content.repository';
import { Content, ContentSchema } from './content.schema';
import { ContentService } from './content.service';
import { StatusContent } from './enums/status-content.enum';
import { SnapshotContentStatusRepository } from './snapshot/snapshot-content-status.repository';

/**
 * Quem aprovou fica no documento enquanto a demanda está aprovada (050, D1).
 * Mongo real: apagar é `$unset`, e `undefined` no `update()` não remove nada.
 */
describe('aprovador da demanda — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let service: ContentService;
  let fileContentService: FileContentService;
  let model: Model<Content>;
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
  const historico = { create: jest.fn().mockResolvedValue(undefined) };

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
        FileContentService,
        FileContentRepository,
        { provide: SnapshotContentStatusRepository, useValue: {} },
        { provide: AuditLogService, useValue: auditLog },
        { provide: ContentFileHistoryService, useValue: historico },
      ],
    }).compile();
    service = mod.get(ContentService);
    fileContentService = mod.get(FileContentService);
    model = mod.get(getModelToken(Content.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  const pendente = async () =>
    model.create({
      title: 'Funções',
      status: StatusContent.Pending,
      subject: String(new Types.ObjectId()),
      userId: 'criador',
      order: 0,
      file: new Types.ObjectId(),
    });
  const noBanco = async (id: unknown) => model.findById(id).lean();
  const aprovar = (id: unknown, por = 'aprovador') =>
    service.changeStatus(String(id), StatusContent.Approved, por);

  it('aprovar grava quem e quando', async () => {
    const d = await pendente();
    const antes = Date.now();

    await aprovar(d._id);

    const doc = await noBanco(d._id);
    expect(doc.status).toBe(StatusContent.Approved);
    expect(doc.approvedBy).toBe('aprovador');
    expect(doc.approvedAt.getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('rejeitar depois apaga o aprovador (e grava o motivo)', async () => {
    const d = await pendente();
    await aprovar(d._id);

    await service.changeStatus(
      String(d._id),
      StatusContent.Rejected,
      'revisor',
      'Faltou a bibliografia',
    );

    const doc = await noBanco(d._id);
    expect(doc).not.toHaveProperty('approvedBy');
    expect(doc).not.toHaveProperty('approvedAt');
    expect(doc.rejectionReason).toBe('Faltou a bibliografia');
  });

  it('reset apaga o aprovador junto com o arquivo', async () => {
    const d = await pendente();
    await aprovar(d._id);

    await service.reset(String(d._id), 'revisor');

    const doc = await noBanco(d._id);
    expect(doc).not.toHaveProperty('approvedBy');
    expect(doc).not.toHaveProperty('file');
  });

  it('arquivo novo apaga o aprovador', async () => {
    const d = await pendente();
    await aprovar(d._id);

    await fileContentService.create({
      fileKey: 'k2',
      originalName: 'v2.docx',
      content: String(d._id),
      uploadedBy: 'autor',
    });

    const doc = await noBanco(d._id);
    expect(doc.status).toBe(StatusContent.Pending);
    expect(doc).not.toHaveProperty('approvedBy');
  });

  it('aprovar sem userId (chamador antigo) aprova, mas fica sem aprovador', async () => {
    const d = await pendente();

    await service.changeStatus(String(d._id), StatusContent.Approved);

    const doc = await noBanco(d._id);
    expect(doc.status).toBe(StatusContent.Approved);
    expect(doc).not.toHaveProperty('approvedBy');
  });
});
