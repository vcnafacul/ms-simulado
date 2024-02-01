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
export class TipoSimuladoExistValidator
  implements ValidatorConstraintInterface
{
  constructor(
    private readonly tipoSimuladoRepository: TipoSimuladoRepository,
  ) {}

  async validate(value: any): Promise<boolean> {
    try {
      const tipoSimulado = await this.tipoSimuladoRepository.getById(value);
      return !!tipoSimulado;
    } catch {
      return false;
    }
  }
}

export const TipoSimuladoExist = (validationOptions: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: TipoSimuladoExistValidator,
    });
  };
};
