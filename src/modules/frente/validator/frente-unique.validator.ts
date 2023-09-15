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
export class FrenteUniqueValidator implements ValidatorConstraintInterface {
  constructor(private readonly frenteRepository: FrenteRepository) {}

  async validate(value: any): Promise<boolean> {
    const frente = await this.frenteRepository.getByFilter({ nome: value });
    return !frente;
  }
}

export const FrenteUnique = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: FrenteUniqueValidator,
    });
  };
};
