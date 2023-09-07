import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { ExameRepository } from '../exame.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class ExameUniqueValidator implements ValidatorConstraintInterface {
  constructor(private readonly exameRepository: ExameRepository) {}

  async validate(value: any): Promise<boolean> {
    const exame = await this.exameRepository.getByFilter({ nome: value });
    return !exame;
  }
}

export const ExameUnique = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: ExameUniqueValidator,
    });
  };
};
