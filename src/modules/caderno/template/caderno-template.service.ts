import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CadernoTemplateRepository } from './caderno-template.repository';
import { CadernoTemplate } from './caderno-template.schema';
import { lintarTemplate } from './template-lint';

/** O que o upload devolve: o que entrou, o que ficou de fora, e o que o lint viu. */
export interface RespostaDoRascunho {
  aceitos: string[];
  ignorados: string[];
  erros: string[];
  avisos: string[];
}

/**
 * O `versao` que todo rascunho carrega enquanto é rascunho.
 *
 * Três fatos sustentam o `0`:
 *
 * 1. `versao` é `required: true` no schema, então o rascunho precisa de
 *    ALGUM número — não dá para deixar de fora.
 * 2. `0` não colide com o índice único de `versao`: existe no máximo um
 *    rascunho por vez (índice parcial em `status: 'rascunho'`), e nenhuma
 *    publicada ou arquivada chega a ter `0`, porque `maiorVersao()` devolve
 *    `0` para coleção vazia e a primeira publicada é `1`.
 * 3. `promoverRascunho` sobrescreve com o número real no publicar.
 *
 * ⚠️ **O número do rascunho não tem significado — é placeholder.** Quem
 * quiser saber a versão de um rascunho está fazendo a pergunta errada: ela só
 * é decidida no publicar. A convenção nasce aqui, no serviço, e nenhum método
 * do repositório a define — por isso tem nome, e não dois literais nus.
 */
export const VERSAO_DO_RASCUNHO = 0;

/** A entrada do upload já extraída — quem abre o zip é o controller. */
export interface EntradaDoRascunho {
  arquivos: Record<string, string>;
  ignorados: string[];
  criadorId: string;
  notas: string;
}

@Injectable()
export class CadernoTemplateService {
  constructor(private readonly repo: CadernoTemplateRepository) {}

  // ---------------------------------------------------------------- consultas

  /**
   * ⚠️ Sem versão publicada isto é **503**, e não um fallback ao `.tex` do
   * repositório. Depois deste card o Mongo é a fonte da verdade: cair no disco
   * em silêncio reintroduziria a dúvida sobre qual é a atual — a prova sairia
   * com o layout antigo e ninguém saberia por quê. Um 503 é visível, e
   * publicar conserta.
   */
  async publicada(): Promise<CadernoTemplate> {
    const publicada = await this.repo.publicada();
    if (!publicada) {
      throw new ServiceUnavailableException(
        'Nenhuma versão do template do caderno está publicada. ' +
          'Publique uma versão antes de gerar cadernos.',
      );
    }
    return publicada;
  }

  /** `null` quando não há: o 404 é decisão do controller. */
  async rascunho(): Promise<CadernoTemplate | null> {
    return await this.repo.rascunho();
  }

  async versoes(): Promise<CadernoTemplate[]> {
    return await this.repo.versoes();
  }

  // ----------------------------------------------------------------- escritas

  /**
   * ⚠️ **Nunca lança por erro de lint.** O rascunho é salvo assim mesmo e os
   * erros voltam na resposta (200). Perder o zip de quem acabou de editar no
   * Overleaf é o pior resultado possível deste fluxo; quem recusa é o
   * `publicar`, com 409.
   */
  async salvarRascunho(
    entrada: EntradaDoRascunho,
  ): Promise<RespostaDoRascunho> {
    const { erros, avisos } = lintarTemplate(entrada.arquivos);

    await this.repo.substituirRascunho({
      versao: VERSAO_DO_RASCUNHO,
      arquivos: new Map(Object.entries(entrada.arquivos)),
      criadorId: entrada.criadorId,
      notas: entrada.notas,
      origemVersao: null,
      publicadaEm: null,
    });

    return {
      aceitos: Object.keys(entrada.arquivos),
      ignorados: entrada.ignorados,
      erros,
      avisos,
    };
  }

  /**
   * ⚠️ O lint roda **de novo** aqui, e não só no upload: o rascunho pode ter
   * vindo de uma restauração feita antes de uma regra nova existir.
   *
   * ⚠️ A transação **arquiva antes de promover**. Ordem, não conveniência: se
   * ela falhar pela metade, o estado intermediário de "zero publicadas"
   * devolve 503 — visível, e republicar conserta. O de "duas publicadas" é
   * ambíguo, e a ambiguidade sobre qual é a atual é o que este card existe
   * para evitar.
   */
  async publicar(): Promise<CadernoTemplate> {
    const rascunho = await this.repo.rascunho();
    if (!rascunho) {
      throw new ConflictException(
        'Não há rascunho para publicar. Envie um zip antes.',
      );
    }

    const lint = lintarTemplate(Object.fromEntries(rascunho.arquivos));
    // ⚠️ `=== false`: com `strictNullChecks: false` o TS não estreita união
    // por negação, e só o aviso não impede publicar.
    if (lint.podePublicar === false) {
      throw new ConflictException({
        message: 'O rascunho tem erros de lint e não pode ser publicado.',
        erros: lint.erros,
        avisos: lint.avisos,
      });
    }

    const versao = (await this.repo.maiorVersao()) + 1;

    const session = await this.repo.startSession();
    session.startTransaction();
    try {
      await this.repo.arquivarPublicada(session);
      await this.repo.promoverRascunho(versao, session);
      await session.commitTransaction();
      session.endSession();
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

    return await this.repo.publicada();
  }

  /**
   * ⚠️ Restaurar **cria rascunho**; publicar gera número novo. A versão antiga
   * não é reaberta e nenhum ponteiro anda para trás — o histórico só avança.
   */
  async restaurar(versao: number, criadorId: string): Promise<void> {
    const origem = await this.repo.porVersao(versao);
    if (!origem) {
      throw new NotFoundException(
        `Versão ${versao} do template do caderno não existe.`,
      );
    }

    await this.repo.substituirRascunho({
      versao: VERSAO_DO_RASCUNHO,
      arquivos: new Map(origem.arquivos),
      criadorId,
      notas: `Restaurado da versão ${versao}`,
      origemVersao: versao,
      publicadaEm: null,
    });
  }

  /** 404 quando não havia nada para apagar — não finge que apagou. */
  async descartarRascunho(): Promise<void> {
    const resultado = await this.repo.descartarRascunho();
    if (!resultado || resultado.deletedCount === 0) {
      throw new NotFoundException('Não há rascunho para descartar.');
    }
  }
}
