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
export class MateriaExistValidator implements ValidatorConstraintInterface {
  constructor(private readonly materiaRepository: MateriaRepository) {}

  async validate(value: any): Promise<boolean> {
    try {
      const materia = await this.materiaRepository.getById(value);
      return !!materia;
    } catch {
      return false;
    }
  }
}

export const MateriaExist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: MateriaExistValidator,
    });
  };
};
