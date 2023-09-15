import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { MateriaRepository } from '../materia.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class MateriaUniqueValidator implements ValidatorConstraintInterface {
  constructor(private readonly materiaRepository: MateriaRepository) {}

  async validate(value: any): Promise<boolean> {
    const materia = await this.materiaRepository.getByFilter({ nome: value });
    return !materia;
  }
}

export const MateriaUnique = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: MateriaUniqueValidator,
    });
  };
};
