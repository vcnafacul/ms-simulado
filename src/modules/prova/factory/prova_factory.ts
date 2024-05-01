import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { Prova } from '../prova.schema';

export interface ProvaFactory {
  createProva: (item: CreateProvaDTOInput) => Promise<Prova>;
  createSimulados: (prova: Prova) => Promise<void>;
}
