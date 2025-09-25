export interface AggregatePeriodByTypeDtoOutput {
  tipo: string | null;
  summary: {
    period: string;
    total: number;
  }[];
}
