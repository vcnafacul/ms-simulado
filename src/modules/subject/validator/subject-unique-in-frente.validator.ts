import { Injectable } from '@nestjs/common';
import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { SubjectRepository } from '../subject.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class SubjectUniqueInFrenteValidator
  implements ValidatorConstraintInterface
{
  constructor(private readonly subjectRepository: SubjectRepository) {}

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    const object = args.object as any;
    const name = value;
    const frenteId = object.frente;

    if (!name || !frenteId) {
      return true; // Deixa outros validators cuidarem disso
    }

    const subject = await this.subjectRepository.getByFilter({
      name,
      frente: frenteId,
    });

    return !subject;
  }

  defaultMessage(): string {
    return 'Já existe um subject com esse nome nesta frente';
  }
}

export const SubjectUniqueInFrente = (
  validationOptions?: ValidationOptions,
) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: SubjectUniqueInFrenteValidator,
    });
  };
};
