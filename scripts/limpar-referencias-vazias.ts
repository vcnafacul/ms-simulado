/**
 * Troca `""` por `null` nas referências da questão — contagem-por-materia 04.
 *
 * ⚠️ **Por que existe:** frente (ou matéria) gravada como string vazia faz o
 * `populate` do `SimuladoRepository.answer` estourar `CastError`, e o
 * `processAnswer` falha para TODO cartão do simulado que contém a questão. O
 * schema agora converte `""` em `null` na escrita; este script limpa o passado.
 *
 * Uso:
 *   MONGODB="mongodb://.../db" yarn limpar:referencias-vazias             # dry-run
 *   MONGODB="mongodb://.../db" yarn limpar:referencias-vazias --escrever
 *
 * ⚠️ Dry-run é o padrão. Idempotente: a segunda execução encontra 0.
 * ⚠️ Driver cru, de propósito: pelo model, o próprio cast do schema já
 *    esconderia o `""` que se quer encontrar.
 *
 * Depois de rodar, rode de novo o `yarn recalcular:aproveitamento` — ele pula
 * (e lista) os simulados cujo populate falhava por isto.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const CAMPOS = ['frente1', 'frente2', 'frente3', 'materia'] as const;

async function run(): Promise<void> {
  const escrever = process.argv.includes('--escrever');
  const uri = process.env.MONGODB;
  if (!uri) {
    console.error('❌ Variável de ambiente MONGODB não definida.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const questoes = mongoose.connection.db!.collection('questaos');

  console.log(escrever ? '✍️  ESCRITA' : '🔎 DRY-RUN');

  // ⚠️ Medido ANTES de escrever: depois, as questões já não têm `""`.
  const afetadas = await questoes
    .find({ $or: CAMPOS.map((c) => ({ [c]: '' })) }, { projection: { _id: 1 } })
    .toArray();
  const simulados = await mongoose.connection
    .db!.collection('simulados')
    .countDocuments({
      'questoes.questao': { $in: afetadas.map((q) => q._id) },
    });

  let total = 0;
  for (const campo of CAMPOS) {
    const filtro = { [campo]: '' };
    const n = await questoes.countDocuments(filtro);
    total += n;
    if (escrever && n > 0) {
      await questoes.updateMany(filtro, { $set: { [campo]: null } });
    }
    console.log(`${campo.padEnd(8)} com "": ${n}`);
  }

  console.log(
    `\nquestões: ${afetadas.length} · campos ${escrever ? 'corrigidos' : 'a corrigir'}: ${total} · simulados que as contêm: ${simulados}`,
  );
  if (!escrever && total > 0) console.log('Para gravar: rode com --escrever');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌', err);
  await mongoose.disconnect();
  process.exit(1);
});
