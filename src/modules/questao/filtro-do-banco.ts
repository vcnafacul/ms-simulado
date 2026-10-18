/**
 * Condições novas do filtro do banco de questões (tickets/043, card 01), em
 * função pura para o teste rodar a MESMA consulta contra o Mongo.
 *
 * - `revisoes`: flags separadas por vírgula, todas `true` ("e").
 * - `comImagem`: ⚠️ `$nin` sozinho casa documento SEM o campo; o `$exists` é o
 *   que tira as questões antigas sem `imageId`.
 */
export function condicoesDoFiltro({
  revisoes,
  comImagem,
}: {
  revisoes?: string;
  comImagem?: 'true';
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const flag of (revisoes ?? '').split(',').filter(Boolean)) {
    where[flag] = true;
  }
  if (comImagem === 'true') {
    where['imageId'] = { $exists: true, $nin: [null, ''] };
  }
  return where;
}
