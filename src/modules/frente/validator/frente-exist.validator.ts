import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { FrenteRepository } from '../frente.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class FrenteExistValidator implements ValidatorConstraintInterface {
  constructor(private readonly frenteRepository: FrenteRepository) {}

  async validate(value: any): Promise<boolean> {
    try {
      const frente = await this.frenteRepository.getById(value);
      return !!frente;
    } catch {
      return false;
    }
  }
}

export const FrenteExist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: FrenteExistValidator,
    });
  };
};
