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
export class ExameExistValidator implements ValidatorConstraintInterface {
  constructor(private readonly exameRepository: ExameRepository) {}

  async validate(value: any): Promise<boolean> {
    try {
      const exame = await this.exameRepository.getById(value);
      return !!exame;
    } catch {
      return false;
    }
  }
}

export const ExameExist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: ExameExistValidator,
    });
  };
};
