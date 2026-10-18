/**
 * Condições novas do filtro do banco de questões (tickets/043, card 01), em
 * função pura para o teste rodar a MESMA consulta contra o Mongo.
 *
 * - `revisoes`: flags separadas por vírgula, todas `true` ("e").
 * - `semImagem`: questões sem imagem da questão — `imageId` nulo, vazio ou
 *   AUSENTE (o `$in: [null]` casa o campo ausente; homol tem questões assim).
 */
export function condicoesDoFiltro({
  revisoes,
  semImagem,
}: {
  revisoes?: string;
  semImagem?: 'true';
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const flag of (revisoes ?? '').split(',').filter(Boolean)) {
    where[flag] = true;
  }
  if (semImagem === 'true') {
    where['imageId'] = { $in: [null, ''] };
  }
  return where;
}
