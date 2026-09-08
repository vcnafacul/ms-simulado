import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../../shared/modules/env/env.service';
import { StorageService } from '../../../shared/storage/storage.service';
import { ImagemRef } from '../gerador/tipos';
import { buscarImagem } from './buscador-http';
import { CacheDeImagens } from './cache-r2';
import { extensaoDosBytes } from './formato';
import { lerPlaceholder } from './placeholder';
import { ArquivoDoZip, ResultadoDaResolucao } from './tipos';

/**
 * Busca os bytes de cada imagem do caderno e devolve os arquivos do zip.
 *
 * ⚠️ **Nada lança, exceto configuração ausente.** Uma imagem que não veio é um
 * defeito visível numa questão; uma exceção aqui é a prova inteira não saindo.
 * Toda falha grava o placeholder sob o nome que o card 02 já escreveu no
 * `.tex`, porque sem arquivo o LaTeX para com "File not found".
 */

const TETO_AGREGADO = 40 * 1024 * 1024;
const CONCORRENCIA = 5;

@Injectable()
export class ResolverDeImagens {
  private readonly logger = new Logger(ResolverDeImagens.name);
  private readonly cache: CacheDeImagens;
  /** Injetável para teste; em produção é sempre o buscador real. */
  private readonly buscar = buscarImagem;

  constructor(
    private readonly storage: StorageService,
    private readonly env: EnvService,
  ) {
    this.cache = new CacheDeImagens(storage);
  }

  async resolver(refs: ImagemRef[]): Promise<ResultadoDaResolucao> {
    const inicio = Date.now();
    const arquivos: ArquivoDoZip[] = [];
    const avisos: string[] = [];
    const metricas = {
      doCache: 0,
      doBucket: 0,
      daInternet: 0,
      falhas: 0,
      bytes: 0,
      ms: 0,
    };

    // Uma busca por origem, não por referência: a mesma imagem costuma
    // aparecer em várias questões, e o card 02 não deduplica quando os nomes
    // no zip diferem.
    //
    // ⚠️ Guarda a *promise*, não o resultado: dentro de um lote de
    // concorrência as duas referências entram em `umaPorVez` antes de
    // qualquer `await` resolver, então checar e gravar só depois do `await`
    // deixa as duas passarem pelo `has()` como "ainda não buscado" e disparar
    // duas buscas. Gravar a promise antes de esperá-la fecha essa janela.
    const jaBuscado = new Map<string, Promise<Buffer | null>>();

    const umaPorVez = async (ref: ImagemRef): Promise<void> => {
      const identidade =
        ref.origem === 'r2' ? `r2:${ref.key}` : `url:${ref.url}`;

      let promessa = jaBuscado.get(identidade);
      if (!promessa) {
        promessa = this.obter(ref, metricas, avisos);
        jaBuscado.set(identidade, promessa);
      }
      const bytes = await promessa;

      if (!bytes) {
        arquivos.push({ nome: `${ref.arquivo}.png`, buffer: lerPlaceholder() });
        return;
      }

      const extensao = extensaoDosBytes(bytes);
      if (!extensao) {
        avisos.push(`${ref.arquivo} — formato de imagem não suportado`);
        metricas.falhas += 1;
        jaBuscado.set(identidade, Promise.resolve(null));
        arquivos.push({ nome: `${ref.arquivo}.png`, buffer: lerPlaceholder() });
        return;
      }

      if (metricas.bytes + bytes.length > TETO_AGREGADO) {
        avisos.push(`${ref.arquivo} — caderno passou do limite de imagens`);
        metricas.falhas += 1;
        arquivos.push({ nome: `${ref.arquivo}.png`, buffer: lerPlaceholder() });
        return;
      }

      metricas.bytes += bytes.length;
      arquivos.push({ nome: `${ref.arquivo}.${extensao}`, buffer: bytes });
    };

    for (let i = 0; i < refs.length; i += CONCORRENCIA) {
      await Promise.all(refs.slice(i, i + CONCORRENCIA).map(umaPorVez));
    }

    metricas.ms = Date.now() - inicio;
    return { arquivos, avisos, metricas };
  }

  /** Os bytes, ou `null` se não deu — o motivo já vai para `avisos`. */
  private async obter(
    ref: ImagemRef,
    metricas: ResultadoDaResolucao['metricas'],
    avisos: string[],
  ): Promise<Buffer | null> {
    if (ref.origem === 'r2') {
      const bucket = this.env.get('QUESTAO_BUCKET');
      if (!bucket) {
        // Configuração ausente é a única coisa que lança: seguir sem ela
        // transformaria toda imagem em "não encontrada", que é o sintoma mais
        // confuso possível.
        throw new Error(
          'QUESTAO_BUCKET não configurado: não dá para ler imagens de questão',
        );
      }
      try {
        const bytes = await this.storage.get(ref.key, bucket);
        metricas.doBucket += 1;
        return bytes;
      } catch {
        avisos.push(`${ref.arquivo} — imagem não encontrada no acervo`);
        metricas.falhas += 1;
        return null;
      }
    }

    const doCache = await this.cache.ler(ref.url);
    if (doCache) {
      metricas.doCache += 1;
      return doCache;
    }

    const resultado = await this.buscar(ref.url);
    // ⚠️ `=== false`, não `!resultado.ok`: este repo tem
    // `strictNullChecks: false` no tsconfig (apesar de `strict: true`), e sem
    // ele o TypeScript não estreita união discriminada por negação.
    if (resultado.ok === false) {
      avisos.push(`${ref.arquivo} — ${resultado.motivo}`);
      metricas.falhas += 1;
      return null;
    }

    metricas.daInternet += 1;

    // Só cacheia o que o pdflatex vai conseguir usar: guardar um GIF só
    // ocuparia espaço para falhar mais rápido da próxima vez.
    if (extensaoDosBytes(resultado.buffer)) {
      await this.cache.gravar(ref.url, resultado.buffer);
    }

    return resultado.buffer;
  }
}
