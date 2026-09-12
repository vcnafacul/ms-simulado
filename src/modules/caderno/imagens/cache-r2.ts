import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { StorageService } from '../../../shared/storage/storage.service';

/**
 * A cópia durável de uma imagem externa no nosso R2.
 *
 * ⚠️ **Isto é cache, não republicação.** A questão continua apontando para o
 * host externo; o R2 só evita rebaixar a mesma imagem a cada download. Apagar o
 * prefixo `caderno-cache/` inteiro não quebra nada — só esfria o cache.
 *
 * Promover a cópia a asset definitivo e reescrever a referência da questão é o
 * **card 08**, que tem `--dry-run`, ensaio em homologação e a pergunta de
 * direito autoral em aberto. Fazer isso como efeito colateral de um download
 * seria decidir por acidente.
 *
 * ⚠️ **Grava no bucket do próprio serviço, não no `QUESTAO_BUCKET`.** Aquela
 * credencial é de leitura apenas. O bucket usado ainda se chama
 * `CARTAO_BUCKET`, nome que ficou mentiroso — renomear env var custa
 * coordenação de deploy que uma POC não precisa pagar.
 */

const PREFIXO = 'caderno-cache';

/**
 * A chave é o sha256 da URL, e isso dá três coisas de graça: idempotência
 * (baixar duas vezes não cria duas cópias), dedup no acervo inteiro sem tabela
 * nenhuma, e um nome que não carrega byte nenhum vindo do usuário.
 *
 * Sem extensão de propósito: o formato real sai dos magic bytes na hora de
 * montar o zip, e gravar a extensão aqui seria repetir a mentira do nome da
 * URL.
 */
export function chaveDoCache(url: string): string {
  return `${PREFIXO}/${createHash('sha256').update(url).digest('hex')}`;
}

export class CacheDeImagens {
  private readonly logger = new Logger(CacheDeImagens.name);

  constructor(private readonly storage: StorageService) {}

  async ler(url: string): Promise<Buffer | null> {
    try {
      return await this.storage.get(chaveDoCache(url));
    } catch {
      // Ausência e falha são a mesma coisa daqui: em qualquer um dos casos a
      // imagem vai ser buscada na fonte.
      return null;
    }
  }

  async gravar(url: string, buffer: Buffer): Promise<void> {
    try {
      await this.storage.putObject(
        chaveDoCache(url),
        buffer,
        'application/octet-stream',
      );
    } catch (erro) {
      // Cache é otimização: não poder gravar não pode impedir a prova de sair.
      this.logger.warn(
        `não consegui cachear ${url}: ${(erro as Error).message}`,
      );
    }
  }
}
