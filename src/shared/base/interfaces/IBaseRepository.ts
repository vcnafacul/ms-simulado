export interface GetAllInput {
  page: number;
  limit: number;
}

export interface GetAllOutput<T> {
  data: T[];
  page: number;
  limit: number;
  totalItems: number;
}
