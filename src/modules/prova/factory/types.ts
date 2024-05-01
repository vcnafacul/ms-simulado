import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { Prova } from '../prova.schema';

export interface IProvaFactory {
  createProva: (item: CreateProvaDTOInput) => Promise<Prova>;
  createSimulados: (prova: Prova) => Promise<void>;
}
