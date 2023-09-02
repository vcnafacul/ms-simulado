export interface IServiceBase<D, DTO> {
  Add: (item: DTO) => Promise<D>;
  GetById: (id: string) => Promise<D | null>;
  GetAll: () => Promise<D[] | null>;
  Delete: (id: string) => Promise<boolean>;
}
