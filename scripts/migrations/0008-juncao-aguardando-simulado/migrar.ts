/**
 * Migração 0008 — junção do relatório com linha "aguardando simulado" (tickets/038, card 13).
 *
 * O cartão DA PROVA do ENEM Dia 1 do cursinho só sabe o simulado no callback (pelo idioma).
 * A linha da junção (`relatoriosimuladoestudantes`) nasce no envio com o simulado vazio, e o
 * índice único `{simulado, cursinhoId, usuario}` de hoje (sem nome, não parcial) faria duas
 * linhas assim do mesmo aluno — cartões de provas diferentes — colidirem em `null`.
 *
 * Troca o índice pelo `juncao_por_estudante` (mesma chave, PARCIAL em simulado ObjectId) e
 * cria o das linhas aguardando por prova. Cria o novo ANTES de apagar o antigo: a chave é a
 * mesma, então não há duplicado possível, e nunca fica sem a trava.
 *
 * Uso:
 *   MONGODB='mongodb://...' yarn migracao:0008            # só mostra os índices
 *   MONGODB='mongodb://...' yarn migracao:0008 --aplicar  # troca
 *
 * Idempotente.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import {
  INDICE_ANTIGO,
  INDICE_AGUARDANDO,
  INDICE_NOVO,
  migrar0008,
} from '../../../src/migracoes/migracoes/0008-juncao-aguardando-simulado';

export { COLECAO } from '../../../src/migracoes/migracoes/0008-juncao-aguardando-simulado';
export { migrar0008 };

async function run(): Promise<void> {
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }
  const aplicar = process.argv.includes('--aplicar');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Falha ao obter a conexão do banco.');
  const r = await migrar0008(db, aplicar);
  console.log(
    `índices: ${INDICE_ANTIGO}=${r.antigo} ${INDICE_NOVO}=${r.novo} ${INDICE_AGUARDANDO}=${r.aguardando}`,
  );
  if (aplicar) {
    if (r.antigo || !r.novo || !r.aguardando) {
      throw new Error('troca de índices não concluída');
    }
    console.log('migração 0008 OK');
  } else {
    console.log('modo CONSULTA — nada foi escrito. Para aplicar: --aplicar');
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error('❌', err instanceof Error ? err.message : err);
    await mongoose.disconnect();
    process.exit(1);
  });
}
