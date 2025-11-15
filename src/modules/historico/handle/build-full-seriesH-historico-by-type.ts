import { addDays, addMonths, format } from 'date-fns';
import { Period } from 'src/shared/enum/period';
import { AggregatePeriodByTypeDtoOutput } from '../dtos/aggregate-period-by-type.dto.output';

interface RawData {
  period: string;
  tipo: string | null;
  total: number;
}

export function buildFullSeriesHistoricoByType(
  groupBy: Period,
  rawData: RawData[],
): AggregatePeriodByTypeDtoOutput[] {
  if (rawData.length === 0) return [];

  // ordena pra garantir consistência
  rawData.sort((a, b) => a.period.localeCompare(b.period));

  // limites do range
  const start =
    groupBy === Period.year
      ? parseInt(rawData[0].period)
      : new Date(rawData[0].period);
  let end =
    groupBy === Period.year
      ? parseInt(rawData[rawData.length - 1].period)
      : new Date(rawData[rawData.length - 1].period);

  if (groupBy === Period.year) {
    end = end;
  } else if (groupBy === Period.month) {
    end = addMonths(end, 1);
  } else {
    end = addDays(end, 1);
  }

  // descobre todos os tipos existentes
  const tipos = Array.from(new Set(rawData.map((r) => r.tipo)));

  // cria um map tipo -> (period -> total)
  const grouped = new Map<string | null, Map<string, number>>();

  for (const r of rawData) {
    if (!grouped.has(r.tipo)) grouped.set(r.tipo, new Map());
    grouped.get(r.tipo)!.set(r.period, r.total);
  }

  const results: AggregatePeriodByTypeDtoOutput[] = [];

  for (const tipo of tipos) {
    const summary: { period: string; total: number }[] = [];

    let cursor = start;
    while (cursor <= end) {
      let period: string;

      switch (groupBy) {
        case Period.day:
          period = format(cursor, 'yyyy-MM-dd');
          cursor = addDays(cursor, 1);
          break;
        case Period.month:
          period = format(cursor, 'yyyy-MM');
          cursor = addMonths(cursor, 1);
          break;
        case Period.year:
          period = (cursor as number).toString();
          cursor = (cursor as number) + 1;
          break;
      }

      summary.push({
        period,
        total: grouped.get(tipo)?.get(period) ?? 0,
      });
    }

    results.push({ tipo, summary });
  }

  return results;
}
