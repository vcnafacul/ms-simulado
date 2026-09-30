import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from 'src/shared/modules/env/env.service';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { HistoricoRepository } from '../historico/historico.repository';
import { numerosDoResultado } from './resultado-do-cartao';

/** 1s, 3s, 9s entre as tentativas. */
export const ESPERAS_MS = [1000, 3000, 9000];
const TIMEOUT_MS = 5000;

/**
 * Avisa a api que o resultado de um CARTÃO saiu (tickets/028, card 01). A api
 * guarda e envia o push em ritmo (cards 02/03).
 *
 * ⚠️ Nunca atrapalha o resultado: roda solto, e falha (api fora, segredo
 * errado) vira log depois de 3 tentativas.
 * ⚠️ HTTP, e não o `stream:vcnafacul:events`: com `QUEUE_DRIVER=memory` o
 * evento nunca sai deste processo — e isso falha calado.
 */
@Injectable()
export class AvisoDeResultadoService {
  private readonly logger = new Logger(AvisoDeResultadoService.name);
  private avisouQueEstaDesligado = false;

  constructor(
    private readonly historicos: HistoricoRepository,
    private readonly env: EnvService,
  ) {}

  /** Separado para o teste não esperar de verdade. */
  pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Não bloqueia quem chama. */
  avisarSemEsperar(historicoId: string): void {
    this.avisar(historicoId).catch((err) =>
      this.logger.error(`Aviso do resultado ${historicoId} falhou`, err),
    );
  }

  async avisar(historicoId: string): Promise<boolean> {
    const apiUrl = this.env.get('API_URL');
    const segredo = this.env.get('NOTIFICACAO_SECRET');
    if (!apiUrl || !segredo) {
      if (!this.avisouQueEstaDesligado) {
        this.logger.warn(
          'API_URL/NOTIFICACAO_SECRET ausentes: push de resultado desligado',
        );
        this.avisouQueEstaDesligado = true;
      }
      return false;
    }

    const h = await this.historicos.getById(historicoId);
    // Só cartão (R1): no digital o aluno já vê o resultado na hora.
    if (!h?.cartaoCode || h.status !== HistoricoStatus.Completed) return false;
    const simulado = h.simulado as unknown as {
      nome?: string;
      questoes?: unknown[];
    };
    const corpo = {
      historicoId,
      userId: h.usuario,
      // A api aceita até 200 (DTO): nome maior viraria 400 e o push não sairia.
      simulado: (simulado?.nome ?? 'Simulado').slice(0, 200),
      ...numerosDoResultado({
        total: simulado?.questoes?.length ?? 0,
        acertos: h.acertos ?? 0,
        questoesRespondidas: h.questoesRespondidas ?? 0,
      }),
    };

    for (let tentativa = 0; ; tentativa++) {
      try {
        await this.post(
          `${apiUrl.replace(/\/$/, '')}/notificacoes/resultado-cartao`,
          segredo,
          corpo,
        );
        return true;
      } catch (err) {
        if (tentativa >= ESPERAS_MS.length - 1) {
          this.logger.error(
            `api não recebeu o resultado ${historicoId}: ${err}`,
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
