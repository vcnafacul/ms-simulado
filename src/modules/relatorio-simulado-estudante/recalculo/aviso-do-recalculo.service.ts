import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from 'src/shared/modules/env/env.service';
import { AfetadoDoRecalculo } from './recalculo-anulacao.schema';

export const ESPERAS_MS = [1000, 3000, 9000];
const TIMEOUT_MS = 5000;

export interface AvisoDoFimDoRecalculo {
  jobId: string;
  provaNome: string;
  simuladoIds: string[];
  numerosAnulados: number[];
  afetados: AfetadoDoRecalculo[];
}

/**
 * Avisa a api que um recálculo por anulação terminou (tickets/042, card 12).
 * A api enfileira os indicadores das turmas (card 14) e manda o push "nota
 * atualizada" (card 17), um por aluno regravado.
 *
 * ⚠️ HTTP com o segredo do 028, como o `AvisoDeResultadoService`: com
 * `QUEUE_DRIVER=memory` um evento de fila nunca sairia deste processo.
 * ⚠️ O recálculo já está concluído: falha aqui vira log, e o job fica sem
 * `avisadoEm` — o boot reenvia.
 */
@Injectable()
export class AvisoDoRecalculoService {
  private readonly logger = new Logger(AvisoDoRecalculoService.name);

  constructor(private readonly env: EnvService) {}

  pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async avisar(corpo: AvisoDoFimDoRecalculo): Promise<boolean> {
    const apiUrl = this.env.get('API_URL');
    const segredo = this.env.get('NOTIFICACAO_SECRET');
    if (!apiUrl || !segredo) {
      this.logger.warn(
        'API_URL/NOTIFICACAO_SECRET ausentes: fim do recálculo não avisado',
      );
      return false;
    }
    const url = `${apiUrl.replace(/\/$/, '')}/notificacoes/recalculo-anulacao`;
    for (let tentativa = 0; ; tentativa++) {
      try {
        await this.post(url, segredo, corpo);
        return true;
      } catch (err) {
        if (tentativa >= ESPERAS_MS.length - 1) {
          this.logger.error(
            `api não recebeu o fim do recálculo ${corpo.jobId}: ${err}`,
          );
          return false;
        }
        await this.pausa(ESPERAS_MS[tentativa]);
      }
    }
  }

  private async post(url: string, segredo: string, corpo: object) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-notificacao-secret': segredo,
        },
        body: JSON.stringify(corpo),
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`api respondeu ${resp.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
