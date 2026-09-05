import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

const RE = /^cartoes\/([^/]+)\/[^/]+$/;

export function parseSimuladoId(imageKey: string): string {
  const m = RE.exec(imageKey ?? '');
  if (!m) throw new BadRequestException(`imageKey inválido: ${imageKey}`);
  const simuladoId = m[1];
  if (!Types.ObjectId.isValid(simuladoId)) {
    throw new BadRequestException(
      `imageKey com simuladoId inválido: ${imageKey}`,
    );
  }
  return simuladoId;
}
