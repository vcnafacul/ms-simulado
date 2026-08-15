import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { CartaoCallbackService } from './cartao-callback.service';

function setup(over: any = {}) {
  const historicoRepository = {
    findByImageKey: jest
      .fn()
      .mockResolvedValue({ _id: 'h1', simulado: { _id: 's1' } }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    prepararParaProcessamento: jest.fn().mockResolvedValue(undefined),
    ...over.historicoRepository,
  };
  const simuladoRepository = {
    answer: jest.fn().mockResolvedValue({
      questoes: [
        { numero: 1, questao: { _id: 'idq1' } },
        { numero: 2, questao: { _id: 'idq2' } },
      ],
    }),
    ...over.simuladoRepository,
  };
  const queueProducer = {
    publish: jest.fn().mockResolvedValue('1-0'),
    ...over.queueProducer,
  };
  return {
    svc: new CartaoCallbackService(
      historicoRepository as any,
      simuladoRepository as any,
      queueProducer as any,
    ),
    historicoRepository,
    simuladoRepository,
    queueProducer,
  };
}

describe('CartaoCallbackService', () => {
  it('não encontrado: ack sem efeitos', async () => {
    const { svc, historicoRepository, queueProducer } = setup({
      historicoRepository: {
        findByImageKey: jest.fn().mockResolvedValue(null),
      },
    });
    await svc.processar({ imageKey: 'k' });
    expect(historicoRepository.updateStatus).not.toHaveBeenCalled();
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('falha: marca Failed, sem publish', async () => {
    const { svc, historicoRepository, queueProducer } = setup();
    await svc.processar({
      imageKey: 'k',
      falha: { motivo: 'cartao_ilegivel' },
    });
    expect(historicoRepository.updateStatus).toHaveBeenCalledWith(
      'h1',
      HistoricoStatus.Failed,
    );
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });

  it('sucesso: mapeia número→_id, prepara e enfileira', async () => {
    const { svc, historicoRepository, queueProducer } = setup();
    await svc.processar({
      imageKey: 'k',
      respostas: [
        { questao: '1', alternativaEstudante: 'A' },
        { questao: '2', alternativaEstudante: 'C' },
        { questao: '99', alternativaEstudante: 'E' }, // fora do mapa → filtrado
      ],
    });
    expect(historicoRepository.prepararParaProcessamento).toHaveBeenCalledWith(
      'h1',
      [
        { questao: 'idq1', alternativaEstudante: 'A' },
        { questao: 'idq2', alternativaEstudante: 'C' },
      ],
    );
    expect(queueProducer.publish).toHaveBeenCalledWith(
      'stream:simulado:answers',
      { histId: 'h1' },
    );
  });

  it('simulado nulo (deletado): marca Failed e ack, sem publish', async () => {
    const { svc, historicoRepository, queueProducer } = setup({
      simuladoRepository: { answer: jest.fn().mockResolvedValue(null) },
    });
    await svc.processar({
      imageKey: 'k',
      respostas: [{ questao: '1', alternativaEstudante: 'A' }],
    });
    expect(historicoRepository.updateStatus).toHaveBeenCalledWith(
      'h1',
      HistoricoStatus.Failed,
    );
    expect(
      historicoRepository.prepararParaProcessamento,
    ).not.toHaveBeenCalled();
    expect(queueProducer.publish).not.toHaveBeenCalled();
  });
});
