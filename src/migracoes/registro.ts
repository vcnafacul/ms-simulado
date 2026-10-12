import type { Db } from 'mongodb';
import { migrar0007 } from './migracoes/0007-historico-prova';
import { migrar0008 } from './migracoes/0008-juncao-aguardando-simulado';
import { migrar0009 } from './migracoes/0009-juncao-aguardando-presa';
import { semearCategoriasEnemCursinho } from './seeds/categorias-enem-cursinho';
import { semearTemplateCaderno } from './seeds/template-caderno';

/**
 * O que roda sozinho no deploy do ms-simulado (homol e prod), antes de o app subir.
 *
 * - **Migração:** roda UMA vez por ambiente, em ordem. O que já rodou fica em `_migracoes`.
 *   Falhou → o deploy para (o ms não sobe contra um banco pela metade).
 * - **Seed:** roda em TODO deploy e tem de ser idempotente. Falhou → fica registrado e o ms
 *   sobe assim mesmo (é conteúdo, não estrutura).
 *
 * ⚠️ **Começa na 0007.** As 0001–0006 são scripts `mongosh` rodados à mão, uma vez, com
 * decisões caso a caso (a 0006 tinha "rebaixar" ou "excluir" os duplicados) — não são
 * automatizáveis e já estão aplicadas onde precisavam.
 *
 * ⚠️ Para acrescentar uma migração: id novo NO FIM da lista, função idempotente, e nunca
 * mudar o id de uma que já foi para algum ambiente (ela rodaria de novo).
 */
export interface Passo {
  id: string;
  descricao: string;
  /** O que fez, em uma linha — vai para o registro. */
  executar(db: Db): Promise<unknown>;
}

export const MIGRACOES: Passo[] = [
  {
    id: '0007-historico-prova',
    descricao:
      'prova nos históricos de cartão; índices cartao_por_estudante_v2 e cartao_da_prova_por_estudante (tickets/038 · 05)',
    executar: (db) => migrar0007(db, true),
  },
  {
    id: '0008-juncao-aguardando-simulado',
    descricao:
      'índice único da junção do relatório parcial em simulado; índice das linhas aguardando (tickets/038 · 13)',
    executar: (db) => migrar0008(db, true),
  },
  {
    id: '0009-juncao-aguardando-presa',
    descricao:
      'move para o simulado as linhas do relatório presas em "aguardando" com a leitura já feita (tickets/038)',
    executar: (db) => migrar0009(db),
  },
];

export const SEEDS: Passo[] = [
  {
    id: 'seed:template-caderno',
    descricao: 'modelo do caderno, versão 1 (Caderno · card 10)',
    executar: (db) => semearTemplateCaderno(db),
  },
  {
    id: 'seed:categorias-enem-cursinho',
    descricao: 'categorias Enem Dia 1/2 do cursinho (tickets/038 · 01)',
    executar: async (db) => {
      const criadas = await semearCategoriasEnemCursinho(db);
      return criadas.length ? `criadas: ${criadas.join(', ')}` : 'já existiam';
    },
  },
];
