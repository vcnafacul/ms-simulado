import { UpdateDTOInput } from 'src/modules/questao/dtos/update.dto.input';
import { Questao } from 'src/modules/questao/questao.schema';
import { CreateProvaDTOInput } from '../dtos/create.dto.input';
import { Prova } from '../prova.schema';
import { CreateQuestaoDTOInput } from 'src/modules/questao/dtos/create.dto.input';

export interface IProvaFactory {
  createProva: (item: CreateProvaDTOInput) => Promise<Prova>;
  createSimulados: (prova: Prova) => Promise<void>;
  getMissingNumbers: (prova: Prova) => Promise<number[]>;
  verifyNumberProva: (id: string, numberQuestion: number) => Promise<boolean>;
  createQuestion: (question: CreateQuestaoDTOInput) => Promise<Questao>;
  updateQuestion: (question: UpdateDTOInput) => void;
}

export enum ExameName {
  ENEM = 'ENEM',
}
