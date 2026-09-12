// ms-simulado/test/caderno-template.e2e-spec.ts
//
// Caderno / Card 10 — o que SÓ o Mongo de verdade prova.
//
// ⚠️ Este arquivo é opt-in e NÃO roda no CI. O `yarn test` é `jest` com
// `rootDir: src`, então só `src/**/*.spec.ts` entra; os `test/*.e2e-spec.ts`
// ficam de fora, de propósito. As 323 specs do módulo rodam contra mocks e
// provam o comportamento do código; três coisas do card elas não alcançam:
//
//   1. o índice parcial impedir dois rascunhos — índice DECLARADO não é índice
//      CONSTRUÍDO, e quem constrói é o servidor;
//   2. a transação do publicar commitar — precisa de replica set, e o `mongo:7`
//      do CI é standalone;
//   3. o zip real do Overleaf — esse continua sem prova aqui: o fixture é um
//      zip que nós montamos.
//
// ⚠️ NÃO há `describe.skip` condicional aqui. Num Mongo standalone o item 2
// falha com `Transaction numbers are only allowed on a replica set member or
// mongos` — e é para falhar mesmo. Um teste que se auto-pula quando o ambiente
// não serve é um teste que nunca reprova nada.
//
// ⚠️ NUNCA aponte o `MONGODB` para homologação: este spec ESCREVE e APAGA.
// Todo `.env` do checkout aponta para lá, então a URI vai na linha de comando,
// e o `beforeAll` recusa host que não seja local.
//
// Como rodar (replica set na 27018, para não colidir com o Mongo de dev):
//
//   docker run -d --name mongo-rs -p 27018:27018 mongo:7 --replSet rs0 --port 27018
//   docker exec mongo-rs mongosh --port 27018 --quiet \
//     --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27018"}]})'
//   MONGODB="mongodb://localhost:27018/ms-simulado-test?directConnection=true" \
//     npx jest --config ./test/jest-e2e.json --detectOpenHandles --forceExit \
//     test/caderno-template.e2e-spec.ts
//   docker rm -f mongo-rs
//
// ⚠️ O `--port 27018` dentro do contêiner não é enfeite: com `-p 27018:27017`
// o mongod escuta 27017 e o `rs.initiate` com `host: localhost:27018` é
// recusado ("No host described in new configuration ... maps to this node").
// Publicando a MESMA porta dos dois lados, o host do membro vale igual dentro
// e fora do contêiner.
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import { CadernoTemplateModule } from '../src/modules/caderno/template/caderno-template.module';
import { CadernoTemplateRepository } from '../src/modules/caderno/template/caderno-template.repository';
import { CadernoTemplate } from '../src/modules/caderno/template/caderno-template.schema';
import { CadernoTemplateService } from '../src/modules/caderno/template/caderno-template.service';

const RAIZ = path.join(__dirname, '..');
const DIR_V1 = path.join(RAIZ, 'src/modules/caderno/templates/v1');

/** O template real do repo: é o que passa no lint, então é o que dá para publicar. */
const ARQUIVOS: Record<string, string> = {
  'main.tex': fs.readFileSync(path.join(DIR_V1, 'main.tex'), 'utf-8'),
  'preambulo.tex': fs.readFileSync(path.join(DIR_V1, 'preambulo.tex'), 'utf-8'),
};

describe('Card 10 — template do caderno contra Mongo de verdade (e2e opt-in)', () => {
  let moduleFixture: TestingModule;
  let model: Model<CadernoTemplate>;
  let repo: CadernoTemplateRepository;
  let service: CadernoTemplateService;
  let uri: string;

  const limpar = async () => {
    await model.deleteMany({});
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    uri = process.env.MONGODB ?? 'mongodb://localhost:27017/ms-simulado-test';
    process.env.MONGODB = uri;

    // ⚠️ Catraca de segurança, não paranoia: este spec apaga a coleção inteira,
    // e o `.env` do checkout aponta para homologação.
    if (!/@?(localhost|127\.0\.0\.1)[:/]/.test(uri)) {
      throw new Error(
        `MONGODB precisa apontar para um Mongo local — este spec escreve e apaga. Veio: ${uri}`,
      );
    }

    moduleFixture = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(uri, { serverSelectionTimeoutMS: 5000 }),
        CadernoTemplateModule,
      ],
    }).compile();
    await moduleFixture.init();

    model = moduleFixture.get<Model<CadernoTemplate>>(
      getModelToken(CadernoTemplate.name),
    );
    repo = moduleFixture.get(CadernoTemplateRepository);
    service = moduleFixture.get(CadernoTemplateService);
  });

  afterAll(async () => {
    if (model) {
      await model.deleteMany({});
      await model.collection.drop().catch(() => undefined);
    }
    if (moduleFixture) await moduleFixture.close();
  });

  it('1. o índice parcial construído barra o segundo rascunho CONCORRENTE', async () => {
    await limpar();
    await model.collection.drop().catch(() => undefined);

    // ⚠️ Só o servidor constrói índice. Sem esta linha o teste mediria a sorte
    // do autoIndex do Mongoose ter terminado a tempo.
    await model.createIndexes();

    // ⚠️ `createIndexes()` sem erro NÃO quer dizer que o índice que interessa
    // entrou — o bug que este arquivo pegou era exatamente esse: o parcial
    // colidia de nome com o simples (`status_1` nos dois), o servidor recusava
    // com `IndexKeySpecsConflict`, e com `autoIndex` a app subia limpa sem
    // ele. Então o que se confere é a LISTA DO SERVIDOR, por nome.
    const indices = await model.collection.indexes();
    const nomes = indices.map((i) => i.name);
    expect(nomes).toContain('status_rascunho_unico');
    expect(nomes).toContain('status_1');

    const parcial = indices.find((i) => i.name === 'status_rascunho_unico');
    expect(parcial?.unique).toBe(true);
    expect(parcial?.partialFilterExpression).toEqual({ status: 'rascunho' });
    // Só um parcial: dois seriam duas regras disputando a mesma garantia.
    expect(
      indices.filter((i) => i.partialFilterExpression !== undefined),
    ).toHaveLength(1);

    // ⚠️ CONCORRENTES, e com `versao` DIFERENTE nos dois. Sequencial passaria
    // sem índice nenhum (o código checa antes de escrever), e `versao` igual
    // faria o E11000 vir do índice único de `versao` — o teste ficaria verde
    // provando o índice errado.
    const resultados = await Promise.allSettled([
      repo.criarRascunho({
        versao: 901,
        arquivos: ARQUIVOS,
        criadorId: 'concorrente-a',
        notas: 'a',
      }),
      repo.criarRascunho({
        versao: 902,
        arquivos: ARQUIVOS,
        criadorId: 'concorrente-b',
        notas: 'b',
      }),
    ]);

    const aceitos = resultados.filter((r) => r.status === 'fulfilled');
    const recusados = resultados.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    expect(aceitos).toHaveLength(1);
    expect(recusados).toHaveLength(1);

    const mensagem = String(recusados[0].reason?.message ?? '');
    expect(mensagem).toContain('E11000');
    // ⚠️ O E11000 tem de vir do índice PARCIAL, nomeado — não do único de
    // `versao`, que provaria outra coisa.
    expect(mensagem).toContain('status_rascunho_unico');
    expect(mensagem).not.toContain('versao_1');

    expect(await model.countDocuments({ status: 'rascunho' })).toBe(1);
  });

  it('2. publicar arquiva a publicada anterior e sobe a versão (transação commitada)', async () => {
    await limpar();

    const agora = new Date();
    await model.collection.insertOne({
      versao: 1,
      status: 'publicada',
      arquivos: ARQUIVOS,
      criadorId: 'system',
      publicadaEm: agora,
      notas: 'seed do repo',
      origemVersao: null,
      deleted: false,
      createdAt: agora,
      updatedAt: agora,
    });

    await service.salvarRascunho({
      arquivos: ARQUIVOS,
      ignorados: [],
      criadorId: 'e2e',
      notas: 'candidata a v2',
    });

    const publicada = await service.publicar();

    expect(publicada.versao).toBe(2);
    expect(publicada.status).toBe('publicada');
    expect(publicada.publicadaEm).toBeTruthy();
    // Prova que a transação COMMITOU: o dado está no banco, não só no retorno.
    const doBanco = await model.findOne({ versao: 2 }).exec();
    expect(doBanco?.status).toBe('publicada');
    expect(doBanco?.publicadaEm).toBeTruthy();
    expect(doBanco?.arquivos['main.tex']).toBe(ARQUIVOS['main.tex']);

    const anterior = await model.findOne({ versao: 1 }).exec();
    expect(anterior?.status).toBe('arquivada');

    expect(await model.countDocuments({ status: 'publicada' })).toBe(1);
    expect(await model.countDocuments({ status: 'rascunho' })).toBe(0);
  });

  it('3. restaurar a v2 nasce rascunho com origemVersao 2, e publicar gera a v4', async () => {
    // Estado de entrada: v1 arquivada, v2 publicada (do teste anterior).
    await service.salvarRascunho({
      arquivos: ARQUIVOS,
      ignorados: [],
      criadorId: 'e2e',
      notas: 'candidata a v3',
    });
    const v3 = await service.publicar();
    expect(v3.versao).toBe(3);

    await service.restaurar(2, 'e2e-restaura');

    const rascunho = await service.rascunho();
    expect(rascunho?.status).toBe('rascunho');
    expect(rascunho?.origemVersao).toBe(2);
    expect(rascunho?.notas).toBe('Restaurado da versão 2');
    expect(rascunho?.publicadaEm).toBeNull();
    const v2 = await model.findOne({ versao: 2 }).exec();
    expect(rascunho?.arquivos).toEqual(v2?.arquivos);
    // ⚠️ Restaurar NÃO reabre a v2: ela continua onde estava.
    expect(v2?.status).toBe('arquivada');

    const v4 = await service.publicar();
    expect(v4.versao).toBe(4);
    expect(v4.origemVersao).toBe(2);
    expect((await model.findOne({ versao: 3 }).exec())?.status).toBe(
      'arquivada',
    );
    expect(await model.countDocuments({ status: 'publicada' })).toBe(1);
    expect((await service.versoes()).map((v) => v.versao)).toEqual([
      4, 3, 2, 1,
    ]);
  });

  it('4. o seed rodado duas vezes não duplica', async () => {
    await limpar();

    const rodarSeed = () =>
      execFileSync(
        path.join(RAIZ, 'node_modules/.bin/ts-node'),
        ['scripts/seed-template-caderno.ts'],
        { cwd: RAIZ, env: { ...process.env, MONGODB: uri }, encoding: 'utf-8' },
      );

    const primeira = rodarSeed();
    expect(primeira).toContain('Versão 1 inserida');
    expect(await model.countDocuments({})).toBe(1);

    const segunda = rodarSeed();
    expect(segunda).toContain('Já existem 1 versão(ões)');
    expect(await model.countDocuments({})).toBe(1);

    const unica = await model.findOne({}).exec();
    expect(unica?.versao).toBe(1);
    expect(unica?.status).toBe('publicada');
    expect(unica?.arquivos['main.tex']).toBe(ARQUIVOS['main.tex']);
    expect(unica?.arquivos['preambulo.tex']).toBe(ARQUIVOS['preambulo.tex']);
  }, 180_000);
});
