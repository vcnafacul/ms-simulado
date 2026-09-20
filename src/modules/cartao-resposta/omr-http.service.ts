import { Injectable } from '@nestjs/common';
import { EnvService } from '../../shared/modules/env/env.service';

@Injectable()
export class OmrHttpService {
  constructor(private readonly env: EnvService) {}

  /**
   * ⚠️ `tentativaId` é o token do acionamento corrente. Ele volta no callback e
   * é o que permite ao `CartaoCallbackService` descartar a reentrega de uma
   * tentativa que já não é a corrente — a `imageKey` sozinha não distingue,
   * porque o `reprocessar` a reusa de propósito.
   */
  async enviarProcessamento(
    imageKey: string,
    tentativaId?: string,
  ): Promise<void> {
    const url = `${this.env.get('OMR_URL')}/omr/process`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageKey, tentativaId }),
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`ms-omr respondeu ${resp.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
