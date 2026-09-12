import { extensaoDosBytes } from '../imagens/formato';
import { acharUrlsExternas, chaveDaUrl, trocarUrl } from './reescrever-texto';
import {
  CAMPOS_DE_TEXTO,
  LinhaDeReversao,
  ResultadoDaRepatriacao,
} from './tipos';

/**
 * Repatria as imagens de uma questão, na ordem que o card exige.
 *
 * ```
 * baixa → extensão → já está no R2? → grava → confirma → SÓ ENTÃO a questão
 * ```
 *
 * ⚠️ **Nunca escrever a questão antes de confirmar a imagem.** Uma questão
 * apontando para uma key que não existe é pior que a URL externa: a imagem
 * some, e some em silêncio.
 *
 * Falha até a confirmação: a questão **não é tocada**, e nada se perde.
 * Falha ao gravar a questão: a imagem fica no R2, e a re-execução a encontra
 * pela chave determinística — sem rebaixar.
 */

export interface Fronteiras {
  buscar: (
    url: string,
  ) => Promise<{ ok: true; buffer: Buffer } | { ok: false; motivo: string }>;
  storage: {
    existe: (chave: string) => Promise<boolean>;
    gravar: (chave: string, bytes: Buffer) => Promise<void>;
  };
  repositorio: {
    /** `$set` APENAS nos campos passados. Nunca o `updateContent`. */
    atualizarCampos: (
      questaoId: string,
      campos: Record<string, string>,
    ) => Promise<void>;
  };
  reversao: { registrar: (linha: LinhaDeReversao) => Promise<void> };
}

export interface QuestaoParaRepatriar {
  _id: unknown;
  [campo: string]: unknown;
}

export async function repatriarQuestao(
  questao: QuestaoParaRepatriar,
  f: Fronteiras,
  opts: { dryRun: boolean },
): Promise<ResultadoDaRepatriacao> {
  const questaoId = String(questao._id);
  const resultado: ResultadoDaRepatriacao = {
    questoesAlteradas: 0,
    imagensBaixadas: 0,
    imagensJaNoR2: 0,
    falhas: [],
  };

  // Uma URL pode aparecer em vários campos: resolvida uma vez só.
  const urls = new Set<string>();
  for (const campo of CAMPOS_DE_TEXTO) {
    for (const u of acharUrlsExternas(String(questao[campo] ?? ''))) {
      urls.add(u);
    }
  }
  if (urls.size === 0) return resultado;

  if (opts.dryRun) {
    // ⚠️ Nem baixa. 64 MB de download não acrescentam informação que o
    // relatório não dê, e um dry-run que faz I/O não é um ensaio.
    resultado.questoesAlteradas = 1;
    return resultado;
  }

  const falhar = (url: string, motivo: string) =>
    resultado.falhas.push({ questaoId, url, motivo });

  const chavePorUrl = new Map<string, string>();
  for (const url of urls) {
    const busca = await f.buscar(url);
    // ⚠️ `=== false`, não `!busca.ok`: este repo tem `strictNullChecks: false`,
    // e sem ele o TS não estreita união discriminada por negação.
    if (busca.ok === false) {
      // O motivo vem do buscador — ele distingue "endereço recusado" de
      // "não pôde ser baixada", e o relatório precisa dessa diferença.
      falhar(url, busca.motivo);
      continue;
    }

    const extensao = extensaoDosBytes(busca.buffer);
    if (!extensao) {
      // pdflatex não inclui GIF nem WEBP. Repatriar não conserta isso — só
      // moveria o problema para dentro do nosso bucket.
      falhar(url, 'formato não suportado');
      continue;
    }

    const chave = chaveDaUrl(url, extensao);
    try {
      if (await f.storage.existe(chave)) {
        resultado.imagensJaNoR2 += 1;
      } else {
        await f.storage.gravar(chave, busca.buffer);
        resultado.imagensBaixadas += 1;
      }
    } catch {
      falhar(url, 'falha ao gravar no R2');
      continue;
    }
    chavePorUrl.set(url, chave);
  }

  if (chavePorUrl.size === 0) return resultado;

  // Só agora o texto é montado — com as imagens já confirmadas no R2.
  const campos: Record<string, string> = {};
  for (const campo of CAMPOS_DE_TEXTO) {
    const original = String(questao[campo] ?? '');
    let novo = original;
    for (const [url, chave] of chavePorUrl) novo = trocarUrl(novo, url, chave);
    if (novo !== original) campos[campo] = novo;
  }
  if (Object.keys(campos).length === 0) return resultado;

  // ⚠️ A reversão vem ANTES da escrita. Depois é tarde: se o processo morrer
  // entre as duas, fica uma questão alterada sem linha de desfazer.
  for (const campo of Object.keys(campos)) {
    await f.reversao.registrar({
      questaoId,
      campo,
      original: String(questao[campo] ?? ''),
    });
  }

  await f.repositorio.atualizarCampos(questaoId, campos);
  resultado.questoesAlteradas = 1;
  return resultado;
}
