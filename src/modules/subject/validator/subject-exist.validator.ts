import { Injectable } from '@nestjs/common';
import {
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';
import { SubjectRepository } from '../subject.repository';

@Injectable()
@ValidatorConstraint({ async: true })
export class SubjectExistValidator implements ValidatorConstraintInterface {
  constructor(private readonly subjectRepository: SubjectRepository) {}

  async validate(value: any): Promise<boolean> {
    try {
      const subject = await this.subjectRepository.getById(value);
      return !!subject;
    } catch {
      return false;
    }
  }
}

export const SubjectExist = (validationOptions?: ValidationOptions) => {
  return (obj: object, props: string) => {
    registerDecorator({
      target: obj.constructor,
      propertyName: props,
      options: validationOptions,
      constraints: [],
      validator: SubjectExistValidator,
    });
  };
};
