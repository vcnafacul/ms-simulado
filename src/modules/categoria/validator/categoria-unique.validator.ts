import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { CategoriaRepository } from '../categoria.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class CategoriaUniqueValidator implements ValidatorConstraintInterface {
  constructor(
    private readonly categoriaRepository: CategoriaRepository,
  ) {}

  async validate(value: any): Promise<boolean> {
    const categoria = await this.categoriaRepository.getByFilter({
      nome: value,
    });
    return !categoria;
  }
}

export const CategoriaUnique = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: CategoriaUniqueValidator,
    });
  };
};
