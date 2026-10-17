import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { AuditLogService } from '../../auditLog/auditLog.service';
import {
  Categoria,
  CategoriaSchema,
  DONO_SYSTEM,
} from '../../categoria/schemas/categoria.schema';
import { HistoricoStatus } from '../../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../../historico/historico.repository';
import { Historico, HistoricoSchema } from '../../historico/historico.schema';
import { AnulacaoRepository } from '../../questao/anulacao/anulacao.repository';
import { QuestaoRepository } from '../../questao/questao.repository';
import { Questao, QuestaoSchema } from '../../questao/questao.schema';
import {
  Simulado,
  SimuladoSchema,
} from '../../simulado/schemas/simulado.schema';
import { HEADER_ATOR } from 'src/shared/ator/ator';
import { VALIDATION_PIPE_OPTIONS } from 'src/config/validation-pipe.config';
import { ProvaController } from '../prova.controller';
import { ProvaRepository } from '../prova.repository';
import { Prova, ProvaSchema } from '../prova.schema';
import { ProvaService } from '../prova.service';
import { ProvaGestaoService } from '../gestao/prova-gestao.service';
import { AnulacaoController } from './anulacao.controller';
import { AnulacaoService } from './anulacao.service';

/**
 * tickets/042, card 03 — as rotas num app de verdade (a colisão de rota nasce
 * no roteamento), com os repositórios contra o Mongo real.
 *
 * ⚠️ Standalone, sem transação: o `emTransacao` escreve direto. Que toda escrita usa a sessão está no `anulacao.repository.spec.ts`.
 */
describe('Anular/desanular questão na prova (042/03)', () => {
  let mongo: MongoMemoryServer | undefined;
  let app: INestApplication;
  let provas: Model<Prova>;
  let simulados: Model<Simulado>;
  let questoes: Model<Questao>;
  let historicos: Model<Historico>;
  let categorias: Model<Categoria>;
  const audit = { create: jest.fn() };

  beforeAll(async () => {
    const uri =
      process.env.MONGODB_TEST_URI ??
      (mongo = await MongoMemoryServer.create()).getUri();
    const mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri),
        MongooseModule.forFeature([
          { name: Prova.name, schema: ProvaSchema },
          { name: Simulado.name, schema: SimuladoSchema },
          { name: Questao.name, schema: QuestaoSchema },
          { name: Historico.name, schema: HistoricoSchema },
          { name: Categoria.name, schema: CategoriaSchema },
        ]),
      ],
      controllers: [ProvaController, AnulacaoController],
      providers: [
        AnulacaoService,
        AnulacaoRepository,
        ProvaRepository,
        HistoricoRepository,
        { provide: QuestaoRepository, useValue: {} },
        { provide: AuditLogService, useValue: audit },
        { provide: ProvaService, useValue: { getByIdComDono: jest.fn() } },
        { provide: ProvaGestaoService, useValue: {} },
      ],
    }).compile();
    // Standalone não tem transação: escreve direto, sem sessão.
    jest
      .spyOn(mod.get(AnulacaoService) as any, 'emTransacao')
      .mockImplementation(async (escrever: any) => escrever(undefined));
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
    await app.init();
    provas = mod.get(getModelToken(Prova.name));
    simulados = mod.get(getModelToken(Simulado.name));
    questoes = mod.get(getModelToken(Questao.name));
    historicos = mod.get(getModelToken(Historico.name));
    categorias = mod.get(getModelToken(Categoria.name));
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  beforeEach(() => audit.create.mockClear());

  const ator = (o: Record<string, unknown>) =>
    JSON.stringify({
      userId: 'u1',
      cursinhoId: null,
      admin: false,
      editorCursinho: false,
      ...o,
    });
  const DO_C1 = ator({ cursinhoId: 'c1', editorCursinho: true });
  const DO_C2 = ator({ cursinhoId: 'c2', editorCursinho: true });
  const ADMIN = ator({ admin: true });
  const corpo = {
    motivo: 'sem_alternativa_correta',
    justificativa: 'A alternativa C, dada como gabarito, está errada.',
  };

  /** Prova (do cursinho c1, ou oficial) com a Q no número 45 e N simulados. */
  async function cenario(
    o: { cursinho?: string | null; simulados?: number } = {},
  ) {
    const cat = (
      await categorias.collection.insertOne({
        nome: 'cat',
        dono: o.cursinho === null ? DONO_SYSTEM : 'c1',
        selecionavel: true,
      } as never)
    ).insertedId;
    const Q = (await questoes.collection.insertOne({} as never)).insertedId;
    const sims: Types.ObjectId[] = [];
    for (let i = 0; i < (o.simulados ?? 1); i++) {
      sims.push(
        (
          await simulados.collection.insertOne({
            questoes: [{ questao: Q, numero: 45 }],
          } as never)
        ).insertedId,
      );
    }
    const P = (
      await provas.collection.insertOne({
        nome: 'Simulado 3',
        categoria: cat,
        cursinhoId: o.cursinho === undefined ? 'c1' : o.cursinho,
        questoes: [{ questao: Q, numero: 45 }],
        simulados: sims,
      } as never)
    ).insertedId;
    const url = `/v1/prova/${P}/questoes/${Q}/anulacao`;
    return { P, Q, sims, url };
  }
  const revisao = async (id: Types.ObjectId) =>
    (await simulados.collection.findOne({ _id: id }))!.revisaoAnulacao;

  it('cursinho na própria prova → 200; espelho e auditoria gravados', async () => {
    const { Q, sims, url } = await cenario();
    const r = await request(app.getHttpServer())
      .put(url)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(200);
    expect(r.body).toMatchObject({ acao: 'anular', numero: 45 });
    expect(await revisao(sims[0])).toBe(1);
    expect(
      (await questoes.collection.findOne({ _id: Q }))!.anulacoes,
    ).toHaveLength(1);
    expect(JSON.parse(audit.create.mock.calls[0][0].changes)).toMatchObject({
      acao: 'anular',
      numero: 45,
      motivo: 'sem_alternativa_correta',
      justificativa: corpo.justificativa,
    });
  });

  it('prova de outro cursinho → 403; oficial → 403 para cursinho', async () => {
    const { url } = await cenario();
    await request(app.getHttpServer())
      .put(url)
      .set(HEADER_ATOR, DO_C2)
      .send(corpo)
      .expect(403);
    const oficial = await cenario({ cursinho: null });
    await request(app.getHttpServer())
      .put(oficial.url)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(403);
  });

  it('⚠️ admin do projeto anula em prova de cursinho (D3-aberta, saída a) e na oficial', async () => {
    const { url } = await cenario();
    await request(app.getHttpServer())
      .put(url)
      .set(HEADER_ATOR, ADMIN)
      .send(corpo)
      .expect(200);
    const oficial = await cenario({ cursinho: null });
    await request(app.getHttpServer())
      .put(oficial.url)
      .set(HEADER_ATOR, ADMIN)
      .send(corpo)
      .expect(200);
  });

  it('sem ator → 403; sem justificativa / curta / motivo inválido → 400', async () => {
    const { url } = await cenario();
    await request(app.getHttpServer()).put(url).send(corpo).expect(403);
    for (const ruim of [
      { motivo: 'outro' },
      { motivo: 'outro', justificativa: '   curta  ' },
      { motivo: 'nao-existe', justificativa: corpo.justificativa },
    ]) {
      await request(app.getHttpServer())
        .put(url)
        .set(HEADER_ATOR, DO_C1)
        .send(ruim)
        .expect(400);
    }
  });

  it('Enem Dia 1 (2 simulados): os dois anulados, revisão +1 em cada', async () => {
    const { P, Q, sims, url } = await cenario({ simulados: 2 });
    await request(app.getHttpServer())
      .put(url)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(200);
    for (const s of sims) {
      expect(await revisao(s)).toBe(1);
      const doc = await simulados.collection.findOne({ _id: s });
      expect(doc!.questoes[0].anulacao.motivo).toBe('sem_alternativa_correta');
    }
    const prova = await provas.collection.findOne({ _id: P });
    expect(String(prova!.questoes[0].questao)).toBe(String(Q));
    expect(prova!.questoes[0].anulacao).toBeDefined();
  });

  it('anular → desanular → anular: revisão +3; editar a justificativa não sobe', async () => {
    const { sims, url } = await cenario();
    const srv = app.getHttpServer();
    await request(srv).put(url).set(HEADER_ATOR, DO_C1).send(corpo).expect(200);
    const d = await request(srv)
      .delete(url)
      .set(HEADER_ATOR, DO_C1)
      .expect(200);
    expect(d.body.acao).toBe('desanular');
    await request(srv).put(url).set(HEADER_ATOR, DO_C1).send(corpo).expect(200);
    expect(await revisao(sims[0])).toBe(3);

    const e = await request(srv)
      .put(url)
      .set(HEADER_ATOR, DO_C1)
      .send({ ...corpo, justificativa: 'Outra justificativa, mais clara.' })
      .expect(200);
    expect(e.body.acao).toBe('editarAnulacao');
    expect(await revisao(sims[0])).toBe(3);
  });

  it('desanular questão que não está anulada → nada (revisão não sobe)', async () => {
    const { sims, url } = await cenario();
    const r = await request(app.getHttpServer())
      .delete(url)
      .set(HEADER_ATOR, DO_C1)
      .expect(200);
    expect(r.body.acao).toBe('nada');
    expect(await revisao(sims[0])).toBeUndefined();
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('⚠️ guarda D10: prova com resultado → 409 ao anular e ao desanular; editar passa', async () => {
    const { P, sims, url } = await cenario();
    const srv = app.getHttpServer();
    await request(srv).put(url).set(HEADER_ATOR, DO_C1).send(corpo).expect(200);
    await historicos.collection.insertOne({
      simulado: sims[0],
      status: HistoricoStatus.Completed,
    } as never);

    const r = await request(srv)
      .delete(url)
      .set(HEADER_ATOR, DO_C1)
      .expect(409);
    expect(r.body.message).toBe(
      'Ainda não é possível anular questão em prova já aplicada.',
    );
    await request(srv)
      .put(url)
      .set(HEADER_ATOR, DO_C1)
      .send({ ...corpo, justificativa: 'Editada depois da aplicação.' })
      .expect(200);

    // Cartão DA prova (038), ainda sem simulado, também conta.
    const outra = await cenario();
    await historicos.collection.insertOne({
      prova: outra.P,
      simulado: null,
      status: HistoricoStatus.Completed,
    } as never);
    await request(srv)
      .put(outra.url)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(409);
    expect(String(P)).not.toBe(String(outra.P));
  });

  it('histórico ainda não concluído não trava', async () => {
    const { sims, url } = await cenario();
    await historicos.collection.insertOne({
      simulado: sims[0],
      status: HistoricoStatus.Pending,
    } as never);
    await request(app.getHttpServer())
      .put(url)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(200);
  });

  it('questão fora da prova → 404; id malformado não casa a rota', async () => {
    const { P } = await cenario();
    await request(app.getHttpServer())
      .put(`/v1/prova/${P}/questoes/${new Types.ObjectId()}/anulacao`)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/v1/prova/${P}/questoes/abc/anulacao`)
      .set(HEADER_ATOR, DO_C1)
      .send(corpo)
      .expect(404);
  });

  it('GET v1/prova/:id continua no ProvaController (sem colisão)', async () => {
    const { P } = await cenario();
    await request(app.getHttpServer()).get(`/v1/prova/${P}`).expect(200);
  });
});
