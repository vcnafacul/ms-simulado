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
export class CategoriaExistValidator implements ValidatorConstraintInterface {
  constructor(
    private readonly categoriaRepository: CategoriaRepository,
  ) {}

  async validate(value: any): Promise<boolean> {
    try {
      const categoria = await this.categoriaRepository.getById(value);
      return !!categoria;
    } catch {
      return false;
    }
  }
}

export const CategoriaExist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: CategoriaExistValidator,
    });
  };
};
