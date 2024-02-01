import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { TipoSimuladoRepository } from '../tipo-simulado.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class TipoSimuladoUniqueValidator
  implements ValidatorConstraintInterface
{
  constructor(
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
  ) {}

  async validate(value: any): Promise<boolean> {
    const tipoSimulado = await this.tipoSimuladoRepository.getByFilter({
      nome: value,
    });
    return !tipoSimulado;
  }
}

export const TipoSimuladoUnique = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: TipoSimuladoUniqueValidator,
    });
  };
};
