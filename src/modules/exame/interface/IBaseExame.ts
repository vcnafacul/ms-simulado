export interface GetAllExamesOutput<Exame> {
  data: Exame[];
  page: number;
  limit: number;
  totalItems: number;
}
