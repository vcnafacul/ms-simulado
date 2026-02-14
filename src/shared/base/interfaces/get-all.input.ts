export interface GetAllInput {
  page: number;
  limit: number;
}

export type SortOrder = 'asc' | 'desc';

export interface GetAllWhereInput extends GetAllInput {
  where?: object;
  or?: object[][];
  sortColumn?: string;
  sortOrder?: SortOrder;
}
