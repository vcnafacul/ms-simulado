/**
 * Repatriação das imagens externas — Caderno · Overleaf, card 08.
 *
 * Baixa cada imagem hospedada fora, grava no nosso R2 e reescreve a referência
 * na questão.
 *
 * Uso:
 *   yarn repatriar:imagens --dry-run
 *   yarn repatriar:imagens --limite 5
 *   yarn repatriar:imagens --questao <id> [--dry-run]
 *   yarn repatriar:imagens
 *   yarn repatriar:imagens --reverter reversao-<timestamp>.jsonl
 *
 * ⚠️ ESTE SCRIPT ESCREVE NO ACERVO. Rode `--dry-run` primeiro, depois
 * `--limite 5`, e confira as cinco questões antes da corrida completa.
 */
import 'dotenv/config';
import * as fs from 'fs';
import mongoose from 'mongoose';
import { buscarImagem } from '../src/modules/caderno/imagens/buscador-http';
import {
  Fronteiras,
  QuestaoParaRepatriar,
  repatriarQuestao,
} from '../src/modules/caderno/repatriar/repatriador';
import { acharUrlsExternas } from '../src/modules/caderno/repatriar/reescrever-texto';
import {
  CAMPOS_DE_TEXTO,
  LinhaDeReversao,
} from '../src/modules/caderno/repatriar/tipos';
import { EnvService } from '../src/shared/modules/env/env.service';
import { StorageService } from '../src/shared/storage/storage.service';

const SENTINELA = 'system';

type MongoDb = NonNullable<(typeof mongoose)['connection']['db']>;

/** Só o que o pdflatex inclui — o mesmo conjunto de `formato.ts`. */
const CONTENT_TYPE_POR_EXTENSAO: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
};

/**
 * Pré-filtro pro Mongo: só os dois construtos que `acharImagens` reconhece,
 * com destino http(s). Não é o critério final — `repatriarQuestao` decide
 * isso com precisão — mas evita varrer toda a coleção quando a imensa
 * maioria das questões cita a fonte em prosa ("Disponível em: http://…"),
 * o que não é um construto de imagem.
 */
const REGEX_CANDIDATA = /!\[[^\]]*\]\(https?:\/\/|<img\b[^>]*src="https?:\/\//i;

/**
 * Chave FIXA do objeto de teste do preflight de permissão — de propósito.
 * Cada corrida real sobrescreve o mesmo objeto (não acumula um por corrida),
 * então ele aparece no relatório com a mesma chave sempre: quem encontrar
 * isto num audit do bucket sabe exatamente o que é e que pode apagar.
 */
const CHAVE_TESTE_PERMISSAO = 'assets/_permissao-teste-repatriar-imagens.txt';

/**
 * `StorageService` é `@Injectable()` e pede `EnvService`, que por sua vez
 * pede o `ConfigService` do Nest. Um CLI de manutenção não tem esse
 * container de pé, e não vale a pena subir um `NestFactory.createApplicationContext`
 * só pra isso — o `dotenv/config` do topo já populou `process.env`.
 *
 * ⚠️ Isto pula os defaults do `envSchema` (zod): em produção/homologação as
 * variáveis AWS_* já precisam estar setadas de verdade (o cartão-resposta
 * depende delas hoje), então ler direto do `process.env` é equivalente.
 */
function criarStorageService(): StorageService {
  const envFalso = {
    get: (chave: string) => process.env[chave],
  } as unknown as EnvService;
  return new StorageService(envFalso);
}

/**
 * Testa a permissão de ESCRITA no bucket ANTES de abrir o cursor de questões.
 *
 * ⚠️ `repatriarQuestao` (Task 2) envolve `storage.existe`/`storage.gravar`
 * num `try/catch` sem distinguir o motivo — qualquer erro vira "falha ao
 * gravar no R2" por URL. Isso é correto para uma imagem individual (rede
 * instável, R2 fora do ar), mas uma credencial sem PutObject falharia em
 * TODAS as 840 ocorrências, uma a uma, disfarçada de falha genérica. Este
 * preflight existe pra pegar esse caso ANTES do laço, com uma mensagem que
 * aponta exatamente o problema.
 *
 * ⚠️ Grava sempre na mesma chave (`CHAVE_TESTE_PERMISSAO`) — cada corrida
 * SOBRESCREVE o objeto anterior, nunca cria um novo. Não acumula lixo no
 * bucket, e a chave aparece no relatório final para quem for auditar saber
 * o que é.
 */
async function verificarPermissaoDeEscrita(
  storage: StorageService,
  bucket: string,
): Promise<void> {
  try {
    await storage.putObject(
      CHAVE_TESTE_PERMISSAO,
      Buffer.from(
        'teste de permissao de escrita — scripts/repatriar-imagens.ts',
      ),
      'text/plain',
      bucket,
    );
  } catch (err: any) {
    console.error(
      `❌ Sem permissão de ESCRITA no bucket "${bucket}" (QUESTAO_BUCKET).\n` +
        '   A credencial usada aqui precisa de PutObject nesse bucket — diferente\n' +
        '   do card 03, que só lê. Nenhuma questão foi tocada.\n' +
        `   Erro original: ${err?.message ?? err}`,
    );
    process.exit(1);
  }
}

function flagValor(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function temFlag(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

interface Relatorio {
  questoesVarridas: number;
  questoesAlteradas: number;
  imagensBaixadas: number;
  imagensJaNoR2: number;
  falhasPorMotivo: Map<string, number>;
  urlsDistintas: number;
  arquivoDeReversao: string | null;
  /** Só preenchido quando o preflight rodou de verdade (corrida real). */
  objetoDeTestePermissao: string | null;
}

function linha(rotulo: string, valor: string | number): string {
  const pontos = '.'.repeat(Math.max(2, 28 - rotulo.length));
  return `${rotulo} ${pontos} ${valor}`;
}

function imprimirRelatorio(r: Relatorio): void {
  const totalFalhas = [...r.falhasPorMotivo.values()].reduce(
    (a, b) => a + b,
    0,
  );

  console.log('');
  console.log(linha('questões varridas', r.questoesVarridas));
  console.log(linha('questões alteradas', r.questoesAlteradas));
  // ⚠️ Extra em relação ao esqueleto do plano: fecha o gate da Task 4 contra
  // o número medido na spec (818 URLs distintas), sem precisar baixar nada
  // — vem do mesmo `acharUrlsExternas` puro, em dry-run ou não.
  console.log(linha('URLs distintas', r.urlsDistintas));
  console.log(linha('imagens baixadas', r.imagensBaixadas));
  console.log(linha('imagens já no R2', r.imagensJaNoR2));
  console.log(linha('falhas', totalFalhas));
  for (const [motivo, contagem] of [...r.falhasPorMotivo.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${motivo}: ${contagem}`);
  }
  console.log(
    linha(
      'arquivo de reversão',
      r.arquivoDeReversao ?? '(nenhum — nada foi alterado)',
    ),
  );
  if (r.objetoDeTestePermissao) {
    console.log(
      linha(
        'objeto de teste de permissão',
        `${r.objetoDeTestePermissao} (sobrescrito a cada corrida, pode ser apagado)`,
      ),
    );
  }
  console.log('');
}

/** 24 caracteres hex — o formato de um ObjectId do Mongo. */
const REGEX_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

async function repatriar(
  db: MongoDb,
  opts: { dryRun: boolean; limite?: number; questaoId?: string },
): Promise<void> {
  const bucket = process.env.QUESTAO_BUCKET;
  if (!bucket) {
    console.error('❌ Variável de ambiente QUESTAO_BUCKET não definida.');
    process.exit(1);
  }

  // ⚠️ Falha aqui, clara, em vez de deixar o driver estourar dentro do
  // `ObjectId.createFromHexString` com uma mensagem que não diz qual flag
  // causou o problema.
  if (opts.questaoId !== undefined && !REGEX_OBJECT_ID.test(opts.questaoId)) {
    console.error(
      `❌ --questao precisa de um ObjectId válido (24 caracteres hex). Recebido: "${opts.questaoId}"`,
    );
    process.exit(1);
  }

  const storage = criarStorageService();

  if (!opts.dryRun) {
    await verificarPermissaoDeEscrita(storage, bucket);
  }

  // ⚠️ Lazy: só vira arquivo de verdade no primeiro `registrar()`. Em
  // dry-run `repatriarQuestao` nunca chama a reversão, então nenhum arquivo
  // — nem vazio — é criado.
  let arquivoDeReversao: string | null = null;

  const fronteiras: Fronteiras = {
    buscar: buscarImagem,
    storage: {
      existe: (chave) => storage.exists(chave, bucket),
      gravar: async (chave, bytes) => {
        const extensao = chave.split('.').pop() ?? '';
        const contentType =
          CONTENT_TYPE_POR_EXTENSAO[extensao] ?? 'application/octet-stream';
        await storage.putObject(chave, bytes, contentType, bucket);
      },
    },
    repositorio: {
      // ⚠️ `updateOne` direto pelo driver, `$set` só nos campos recebidos.
      // Nunca o `updateContent` do repositório — ele também escreve
      // `alternativa` (select:false), e um read-modify-write não preserva o
      // que não lê.
      atualizarCampos: async (questaoId, campos) => {
        await db
          .collection('questaos')
          .updateOne(
            { _id: new mongoose.Types.ObjectId(questaoId) },
            { $set: campos },
          );

        // Rastreabilidade, não desfazer: o `changes` guarda só o valor novo
        // (aqui, quantos campos mudaram). Quem reverte é o arquivo .jsonl.
        await db.collection('auditlogs').insertOne({
          user: SENTINELA,
          entityId: questaoId,
          entityType: 'Questao',
          changes: JSON.stringify({ repatriadas: Object.keys(campos).length }),
          deleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      },
    },
    reversao: {
      registrar: async (linhaDeReversao: LinhaDeReversao) => {
        if (!arquivoDeReversao) {
          arquivoDeReversao = `reversao-${Date.now()}.jsonl`;
        }
        // ⚠️ `appendFileSync`, linha a linha — não acumular em memória e
        // gravar no fim. Se o processo morrer no meio, o que já foi escrito
        // precisa estar em disco.
        fs.appendFileSync(
          arquivoDeReversao,
          JSON.stringify(linhaDeReversao) + '\n',
        );
      },
    },
  };

  // ⚠️ `--questao` substitui o pré-filtro por texto: a intenção ali é mirar
  // numa questão específica (o gate, depois do `--limite 5`), não achar
  // candidatas. O relatório final sai igual, só que sobre uma questão só.
  const filtro = opts.questaoId
    ? { _id: new mongoose.Types.ObjectId(opts.questaoId) }
    : { $or: CAMPOS_DE_TEXTO.map((campo) => ({ [campo]: REGEX_CANDIDATA })) };
  const projecao = Object.fromEntries(
    CAMPOS_DE_TEXTO.map((campo) => [campo, 1]),
  );

  const cursor = db
    .collection('questaos')
    .find(filtro, { projection: projecao });
  if (opts.limite) cursor.limit(opts.limite);

  const urlsDistintas = new Set<string>();
  const falhasPorMotivo = new Map<string, number>();
  let questoesVarridas = 0;
  let questoesAlteradas = 0;
  let imagensBaixadas = 0;
  let imagensJaNoR2 = 0;

  for await (const doc of cursor) {
    questoesVarridas += 1;
    const questao = doc as unknown as QuestaoParaRepatriar;

    // Puro, sem I/O: roda igual em dry-run ou não. Só alimenta o relatório.
    for (const campo of CAMPOS_DE_TEXTO) {
      for (const url of acharUrlsExternas(String(questao[campo] ?? ''))) {
        urlsDistintas.add(url);
      }
    }

    const resultado = await repatriarQuestao(questao, fronteiras, {
      dryRun: opts.dryRun,
    });

    questoesAlteradas += resultado.questoesAlteradas;
    imagensBaixadas += resultado.imagensBaixadas;
    imagensJaNoR2 += resultado.imagensJaNoR2;
    for (const falha of resultado.falhas) {
      falhasPorMotivo.set(
        falha.motivo,
        (falhasPorMotivo.get(falha.motivo) ?? 0) + 1,
      );
    }
  }

  imprimirRelatorio({
    questoesVarridas,
    questoesAlteradas,
    imagensBaixadas,
    imagensJaNoR2,
    falhasPorMotivo,
    urlsDistintas: urlsDistintas.size,
    arquivoDeReversao,
    objetoDeTestePermissao: opts.dryRun ? null : CHAVE_TESTE_PERMISSAO,
  });
}

/**
 * Lê o `.jsonl` e devolve cada campo ao `original`. Idempotente: aplicar
 * duas vezes dá o mesmo resultado.
 *
 * ⚠️ NÃO apaga as imagens do R2 — jogaria fora o que já foi baixado, e a
 * chave determinística faz a próxima corrida reaproveitá-las.
 */
async function reverter(db: MongoDb, arquivo: string): Promise<void> {
  if (!fs.existsSync(arquivo)) {
    console.error(`❌ Arquivo de reversão não encontrado: ${arquivo}`);
    process.exit(1);
  }

  const linhas = fs
    .readFileSync(arquivo, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let camposRevertidos = 0;
  const questoesTocadas = new Set<string>();

  for (const linhaTexto of linhas) {
    const linhaDeReversao = JSON.parse(linhaTexto) as LinhaDeReversao;
    await db
      .collection('questaos')
      .updateOne(
        { _id: new mongoose.Types.ObjectId(linhaDeReversao.questaoId) },
        { $set: { [linhaDeReversao.campo]: linhaDeReversao.original } },
      );
    camposRevertidos += 1;
    questoesTocadas.add(linhaDeReversao.questaoId);
  }

  console.log(
    `✓ Reversão concluída: ${camposRevertidos} campo(s) em ${questoesTocadas.size} questão(ões).`,
  );
  console.log(
    '  As imagens gravadas no R2 NÃO foram removidas (de propósito).',
  );
}

async function run(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }

  const dryRun = temFlag('dry-run');
  const arquivoReversao = flagValor('reverter');
  const questaoId = flagValor('questao');
  const limiteStr = flagValor('limite');
  if (limiteStr !== undefined && Number.isNaN(Number(limiteStr))) {
    console.error(`❌ --limite precisa de um número. Recebido: "${limiteStr}"`);
    process.exit(1);
  }
  const limite = limiteStr ? Number(limiteStr) : undefined;

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Falha ao obter a conexão do banco.');
    process.exit(1);
  }

  try {
    if (arquivoReversao) {
      await reverter(db, arquivoReversao);
    } else {
      await repatriar(db, { dryRun, limite, questaoId });
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
