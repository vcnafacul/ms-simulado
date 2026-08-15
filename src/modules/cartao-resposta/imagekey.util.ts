import { BadRequestException } from '@nestjs/common';

const RE = /^cartoes\/([^/]+)\/[^/]+$/;

export function parseSimuladoId(imageKey: string): string {
  const m = RE.exec(imageKey ?? '');
  if (!m) throw new BadRequestException(`imageKey inválido: ${imageKey}`);
  return m[1];
}
