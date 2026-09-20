import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import {
  CartaoVarreduraService,
  JANELA_MINUTOS,
} from './cartao-varredura.service';
import { CodigoFalhaInterno } from '../historico/falha/codigo-falha';

const AGORA = new Date('2026-09-20T12:00:00Z');

const montar = (presos: any[] = []) => {
  const historicoRepository = {
    findAwaitingOmrAntigos: jest.fn().mockResolvedValue(presos),
    marcarFalha: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new CartaoVarreduraService(historicoRepository as any);
  return { svc, historicoRepository };
};

describe('CartaoVarreduraService', () => {
  it('⚠️ a janela e de 60 minutos, e o corte sai dela', async () => {
    // MEDIDO: o pior caso de PROCESSAMENTO do ms-omr e 630s (job_timeout 180s
    // x 3 tentativas + backoff 30s e 60s). Mas `omr_max_workers` e
    // `cpu_count()-1` e a VPS tem 1 vCPU: um worker, em serie. Numa turma de
    // 50 cartoes o ultimo espera a fila inteira ANTES de comecar. Uma janela
    // curta mataria cartao que ia terminar, e a varredura viraria a causa do
    // problema que deveria resolver.
    const { svc, historicoRepository } = montar();

    await svc.varrer(AGORA);

    expect(JANELA_MINUTOS).toBe(60);
    const corte = historicoRepository.findAwaitingOmrAntigos.mock.calls[0][0];
    expect(corte).toEqual(new Date('2026-09-20T11:00:00Z'));
  });

  it('marca cada preso como falho com leitura_nao_retornou', async () => {
    const { svc, historicoRepository } = montar([{ _id: 'h1' }, { _id: 'h2' }]);

    await svc.varrer(AGORA);

    expect(historicoRepository.marcarFalha).toHaveBeenCalledTimes(2);
    expect(historicoRepository.marcarFalha).toHaveBeenCalledWith(
      'h1',
      CodigoFalhaInterno.LeituraNaoRetornou,
      expect.any(String),
    );
  });

  it('sem nada preso, nao escreve nada', async () => {
    const { svc, historicoRepository } = montar([]);

    await svc.varrer(AGORA);

    expect(historicoRepository.marcarFalha).not.toHaveBeenCalled();
  });

  it('⚠️ um preso que falha ao ser marcado nao derruba os outros', async () => {
    // A varredura roda sozinha, sem ninguem olhando. Se o primeiro documento
    // estourar e a excecao subir, os demais ficam presos ate a proxima volta —
    // ou para sempre, se o erro for deterministico.
    const { svc, historicoRepository } = montar([{ _id: 'h1' }, { _id: 'h2' }]);
    historicoRepository.marcarFalha
      .mockRejectedValueOnce(new Error('mongo caiu'))
      .mockResolvedValueOnce(undefined);

    await expect(svc.varrer(AGORA)).resolves.toBeUndefined();

    expect(historicoRepository.marcarFalha).toHaveBeenCalledTimes(2);
  });

  it('⚠️ o metodo agendado e DESCOBERTO pelo @Cron', () => {
    // Sem este teste, um erro no decorator faz o card falhar EM SILENCIO —
    // o pior desfecho possivel para um conserto que existe justamente para
    // acabar com o silencio de um cartao preso.
    const meta = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      CartaoVarreduraService.prototype.varrerAgendado,
    );

    expect(meta).toBeDefined();
  });
});
