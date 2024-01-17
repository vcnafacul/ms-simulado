import { IsNumberString, IsOptional } from 'class-validator';

export class PaginateQuery {
  constructor(page?: string, limit?: string) {
    this.page = page ? parseInt(page) : 1;
    this.limit = limit ? parseInt(limit) : 10;
  }
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}
