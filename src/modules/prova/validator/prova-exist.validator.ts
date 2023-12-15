import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { ProvaRepository } from '../prova.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class ProvaExistValidator implements ValidatorConstraintInterface {
  constructor(private readonly provaRepository: ProvaRepository) {}

  async validate(value: any): Promise<boolean> {
    try {
      const prova = await this.provaRepository.getById(value);
      return !!prova;
    } catch {
      return false;
    }
  }
}

export const ProvaExist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: ProvaExistValidator,
    });
  };
};
