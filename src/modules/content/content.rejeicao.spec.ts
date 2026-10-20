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
 * Rejeitar exige motivo; o motivo vive no documento enquanto a demanda está
 * rejeitada e some quando ela recomeça (aprovar, resetar, arquivo novo).
 *
 * ⚠️ Mongo real: apagar o motivo é `$unset`, e `undefined` no `update()`
 * comum não remove nada — um mock não distinguiria os dois.
 */
describe('motivo da rejeição — Mongo real', () => {
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
    auditLog.create.mockClear();
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

  it('⚠️ rejeitar sem motivo é 400 e não muda nada', async () => {
    const d = await pendente();

    await expect(
      service.changeStatus(String(d._id), StatusContent.Rejected, 'revisor'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.changeStatus(
        String(d._id),
        StatusContent.Rejected,
        'revisor',
        '   ',
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect((await noBanco(d._id)).status).toBe(StatusContent.Pending);
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it('rejeitar com motivo grava o motivo e o log leva status + motivo', async () => {
    const d = await pendente();

    await service.changeStatus(
      String(d._id),
      StatusContent.Rejected,
      'revisor',
      'Faltou a seção de exercícios',
    );

    const doc = await noBanco(d._id);
    expect(doc.status).toBe(StatusContent.Rejected);
    expect(doc.rejectionReason).toBe('Faltou a seção de exercícios');
    expect(JSON.parse(auditLog.create.mock.calls[0][0].changes)).toEqual({
      status: StatusContent.Rejected,
      message: 'Faltou a seção de exercícios',
    });
  });

  it('aprovar depois apaga o motivo', async () => {
    const d = await pendente();
    await service.changeStatus(
      String(d._id),
      StatusContent.Rejected,
      'revisor',
      'motivo',
    );

    await service.changeStatus(String(d._id), StatusContent.Approved, 'revisor');

    const doc = await noBanco(d._id);
    expect(doc.status).toBe(StatusContent.Approved);
    expect(doc).not.toHaveProperty('rejectionReason');
  });

  it('reset apaga o motivo junto com o arquivo', async () => {
    const d = await pendente();
    await service.changeStatus(
      String(d._id),
      StatusContent.Rejected,
      'revisor',
      'motivo',
    );

    await service.reset(String(d._id), 'revisor');

    const doc = await noBanco(d._id);
    expect(doc).not.toHaveProperty('rejectionReason');
    expect(doc).not.toHaveProperty('file');
  });

  it('arquivo novo apaga o motivo e volta a Pending', async () => {
    const d = await pendente();
    await service.changeStatus(
      String(d._id),
      StatusContent.Rejected,
      'revisor',
      'motivo',
    );

    await fileContentService.create({
      fileKey: 'k2',
      originalName: 'v2.docx',
      content: String(d._id),
      uploadedBy: 'autor',
    });

    const doc = await noBanco(d._id);
    expect(doc.status).toBe(StatusContent.Pending);
    expect(doc).not.toHaveProperty('rejectionReason');
    expect(doc.lastEditedBy).toBe('autor');
  });
});
