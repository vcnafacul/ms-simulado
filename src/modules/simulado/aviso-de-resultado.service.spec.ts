import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { AvisoDeResultadoService } from './aviso-de-resultado.service';
import { AnswerProcessorService } from './answer-processor.service';

describe('AvisoDeResultadoService (028 · 01)', () => {
  const historico = (over = {}) => ({
    usuario: 'aluno-1',
    cartaoCode: 'C1',
    status: HistoricoStatus.Completed,
    acertos: 61,
    questoesRespondidas: 86,
    simulado: { nome: 'Simulado de outubro', questoes: new Array(90).fill({}) },
    ...over,
  });

  const montar = (
    env: Record<string, string | undefined> = {
      API_URL: 'https://api.teste/',
      NOTIFICACAO_SECRET: 's3gr3do',
    },
  ) => {
    const repo = { getById: jest.fn().mockResolvedValue(historico()) };
    const service = new AvisoDeResultadoService(
      repo as never,
      { get: (k: string) => env[k] } as never,
    );
    service.pausa = jest.fn().mockResolvedValue(undefined);
    return { service, repo };
  };

  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 202 });
    (global as any).fetch = fetchMock;
  });

  it('cartão concluído → POST com o segredo e os números certos', async () => {
    const { service } = montar();
    expect(await service.avisar('h1')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.teste/notificacoes/resultado-cartao');
    expect(init.headers['x-notificacao-secret']).toBe('s3gr3do');
    expect(JSON.parse(init.body)).toEqual({
      historicoId: 'h1',
      userId: 'aluno-1',
      simulado: 'Simulado de outubro',
      total: 90,
      acertos: 61,
      erros: 25,
      emBranco: 4,
      aproveitamento: 68,
    });
  });

  it('digital (sem cartaoCode) ou não concluído → nada', async () => {
    const { service, repo } = montar();
    repo.getById.mockResolvedValueOnce(historico({ cartaoCode: undefined }));
    expect(await service.avisar('h1')).toBe(false);
    repo.getById.mockResolvedValueOnce(
      historico({ status: HistoricoStatus.Failed }),
    );
    expect(await service.avisar('h1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('⚠️ sem API_URL/NOTIFICACAO_SECRET → nada, sem erro e sem nem ler o histórico', async () => {
    const { service, repo } = montar({
      API_URL: undefined,
      NOTIFICACAO_SECRET: 'x',
    });
    expect(await service.avisar('h1')).toBe(false);
    expect(repo.getById).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('api fora: 3 tentativas (esperando 1s e 3s) e desiste com log', async () => {
    const { service } = montar();
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await service.avisar('h1')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((service.pausa as jest.Mock).mock.calls.map(([ms]) => ms)).toEqual([
      1000, 3000,
    ]);
  });

  it('segredo errado (403) também tenta 3 vezes e não lança', async () => {
    const { service } = montar();
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(service.avisar('h1')).resolves.toBe(false);
  });

  it('⚠️ o processador de respostas avisa SEM esperar (a fila não trava)', async () => {
    const aviso = { avisarSemEsperar: jest.fn() };
    const processor = new AnswerProcessorService(
      { register: jest.fn() } as never,
      { processAnswer: jest.fn() } as never,
      {
        getById: jest
          .fn()
          .mockResolvedValue({ usuario: 'u', status: 'pending' }),
      } as never,
      { publish: jest.fn() } as never,
      aviso as never,
    );
    await (processor as any).handleMessage('h1');
    expect(aviso.avisarSemEsperar).toHaveBeenCalledWith('h1');
  });
});
