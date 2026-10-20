import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { ContentFileHistoryService } from '../content-file-history/content-file-history.service';
import { ContentRepository } from '../content/content.repository';
import { Content, ContentSchema } from '../content/content.schema';
import { StatusContent } from '../content/enums/status-content.enum';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Subject, SubjectSchema } from '../questao/subject/subject.schema';
import { FileContentRepository } from './file-content.repository';
import {
  FileContent,
  FileContentSchema,
  TipoFileContent,
} from './file-content.schema';
import { FileContentService } from './file-content.service';

/**
 * `FileContent` é "o que foi enviado": documento (fileKey) OU vídeo (videoId),
 * nunca os dois. Mongo real porque a regra mora no schema.
 */
describe('FileContent — documento ou vídeo (Mongo real)', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let model: Model<FileContent>;
  let contents: Model<Content>;
  let service: FileContentService;
  const historico = { create: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: FileContent.name, schema: FileContentSchema },
          { name: Content.name, schema: ContentSchema },
          { name: Subject.name, schema: SubjectSchema },
          { name: Frente.name, schema: FrenteSchema },
        ]),
      ],
      providers: [
        FileContentService,
        FileContentRepository,
        ContentRepository,
        { provide: ContentFileHistoryService, useValue: historico },
      ],
    }).compile();
    model = mod.get(getModelToken(FileContent.name));
    contents = mod.get(getModelToken(Content.name));
    service = mod.get(FileContentService);
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    historico.create.mockClear();
    await model.deleteMany({});
    await contents.deleteMany({});
  });

  const content = String(new Types.ObjectId());

  it('sem tipo é documento (os existentes no banco são todos documento)', async () => {
    const doc = await model.create({ fileKey: 'k', content, uploadedBy: 'u' });
    expect(doc.tipo).toBe(TipoFileContent.Documento);
  });

  it('documento sem fileKey falha', async () => {
    await expect(
      model.create({ tipo: TipoFileContent.Documento, content, uploadedBy: 'u' }),
    ).rejects.toThrow(/fileKey/);
  });

  it('vídeo salva com videoId e sem fileKey', async () => {
    const v = await model.create({
      tipo: TipoFileContent.Video,
      videoId: 'dQw4w9WgXcQ',
      content,
      uploadedBy: 'u',
    });
    expect(v.videoId).toBe('dQw4w9WgXcQ');
    expect(v.fileKey).toBeUndefined();
  });

  it('vídeo sem videoId, com id curto, ou com fileKey junto: falha', async () => {
    const base = { tipo: TipoFileContent.Video, content, uploadedBy: 'u' };
    await expect(model.create(base)).rejects.toThrow(/videoId/);
    await expect(model.create({ ...base, videoId: 'curto' })).rejects.toThrow(
      /videoId/,
    );
    await expect(
      model.create({ ...base, videoId: 'dQw4w9WgXcQ', fileKey: 'k' }),
    ).rejects.toThrow(/vídeo não tem arquivo/);
  });

  it('create de vídeo pelo service: vigente, Pending, histórico, lastEditedBy', async () => {
    const demanda = await contents.create({
      title: 'Funções',
      status: StatusContent.Pending_Upload,
      subject: String(new Types.ObjectId()),
      userId: 'criador',
      order: 0,
    });

    const fc = await service.create({
      tipo: TipoFileContent.Video,
      videoId: 'dQw4w9WgXcQ',
      content: String(demanda._id),
      uploadedBy: 'autora',
    });

    const noBanco = await contents.findById(demanda._id).lean();
    expect(String(noBanco.file)).toBe(String(fc._id));
    expect(noBanco.status).toBe(StatusContent.Pending);
    expect(noBanco.lastEditedBy).toBe('autora');
    expect(historico.create).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedBy: 'autora' }),
    );
  });

  it('service recusa vídeo com fileKey (400) antes de tocar o banco', async () => {
    await expect(
      service.create({
        tipo: TipoFileContent.Video,
        videoId: 'dQw4w9WgXcQ',
        fileKey: 'k',
        content: String(new Types.ObjectId()),
        uploadedBy: 'u',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await model.countDocuments()).toBe(0);
  });
});
