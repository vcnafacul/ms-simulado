import { Injectable } from '@nestjs/common';
import { EnvService } from '../../shared/modules/env/env.service';

@Injectable()
export class OmrHttpService {
  constructor(private readonly env: EnvService) {}

  async enviarProcessamento(imageKey: string): Promise<void> {
    const url = `${this.env.get('OMR_URL')}/omr/process`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageKey }),
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`ms-omr respondeu ${resp.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
