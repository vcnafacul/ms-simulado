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
export class Frente2And3ExistValidator implements ValidatorConstraintInterface {
  constructor(private readonly frenteRepository: FrenteRepository) {}

  async validate(value: any): Promise<boolean> {
    try {
      if (value) {
        const frente = await this.frenteRepository.getById(value);
        return !!frente;
      }
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const Frente2And3Exist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: Frente2And3ExistValidator,
    });
  };
};
