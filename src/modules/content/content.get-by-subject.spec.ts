import { ValidationPipe } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { VALIDATION_PIPE_OPTIONS } from 'src/config/validation-pipe.config';
import {
  FileContent,
  FileContentSchema,
} from '../file-content/file-content.schema';
import { Frente, FrenteSchema } from '../frente/frente.schema';
import { Subject, SubjectSchema } from '../questao/subject/subject.schema';
import { ContentRepository } from './content.repository';
import { Content, ContentSchema } from './content.schema';
import { GetBySubjectDtoInput } from './dtos/get-by-subject.dto.input';
import { StatusContent } from './enums/status-content.enum';

/**
 * A página do tema do aluno pede `?status=1` e só pode receber aprovados.
 *
 * ⚠️ Mongo real, porque o bug morava na consulta: o controller descartava o
 * `status` e o `find` nunca o viu. Um mock do repositório provaria só que o
 * service repassa o argumento — e foi exatamente o repasse que faltou.
 */
describe('conteúdos do tema por status — Mongo real', () => {
  let mongo: MongoMemoryServer | undefined;
  let mod: TestingModule;
  let repo: ContentRepository;
  let model: Model<Content>;
  // ⚠️ Texto, não ObjectId: `subject` é `type: Types.ObjectId` (do mongoose),
  // que vira Mixed e grava o que chega — e o `create` recebe o id em texto
  // (`IsString`). Gravar ObjectId aqui faria o teste passar por um banco que
  // não existe em produção.
  const tema = String(new Types.ObjectId());
  const outroTema = String(new Types.ObjectId());

  const conteudo = (
    title: string,
    status: StatusContent,
    subject: string = tema,
    extra: Record<string, unknown> = {},
  ) => ({ title, status, subject, userId: 'u1', order: 0, ...extra });

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
      providers: [ContentRepository],
    }).compile();
    repo = mod.get(ContentRepository);
    model = mod.get(getModelToken(Content.name));
  }, 60000);

  afterAll(async () => {
    await mod?.close();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    await model.create([
      conteudo('aprovado', StatusContent.Approved, tema, { order: 1 }),
      conteudo('pendente', StatusContent.Pending),
      conteudo('rejeitado', StatusContent.Rejected),
      conteudo('aguardando envio', StatusContent.Pending_Upload),
      conteudo('aprovado excluído', StatusContent.Approved, tema, {
        deleted: true,
      }),
      conteudo('aprovado de outro tema', StatusContent.Approved, outroTema),
    ]);
  });

  it('⚠️ com status=Approved só vêm os aprovados do tema (o que o aluno vê)', async () => {
    const lista = await repo.getBySubject(tema, StatusContent.Approved);

    expect(lista.map((c) => c.title)).toEqual(['aprovado']);
  });

  it('sem status vêm todos os do tema, menos os excluídos — como sempre foi', async () => {
    const lista = await repo.getBySubject(tema);

    expect(lista.map((c) => c.title).sort()).toEqual([
      'aguardando envio',
      'aprovado',
      'pendente',
      'rejeitado',
    ]);
  });

  it('status=Pending (0) também filtra — zero é falsy e um `if (status)` o perderia', async () => {
    // Pending=0 é falsy: um `if (status)` em vez de `!== undefined` deixaria
    // o filtro por Pending passar como "sem filtro".
    const pendentes = await repo.getBySubject(tema, StatusContent.Pending);

    expect(pendentes.map((c) => c.title)).toEqual(['pendente']);
  });
});

describe('GetBySubjectDtoInput pelo pipe global', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const meta = { type: 'query', metatype: GetBySubjectDtoInput } as any;

  it('"1" do querystring vira o número 1 — senão o IsEnum recusaria a api', async () => {
    const out = await pipe.transform({ status: '1' } as any, meta);

    expect(out.status).toBe(StatusContent.Approved);
  });

  it('sem status passa, e fica undefined (sem filtro)', async () => {
    const out = await pipe.transform({} as any, meta);

    expect(out.status).toBeUndefined();
  });

  it('status fora do enum é 400', async () => {
    await expect(
      pipe.transform({ status: 'abc' } as any, meta),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform({ status: '9' } as any, meta),
    ).rejects.toMatchObject({ status: 400 });
  });
});
