import { EnemService } from './enem_service';

/**
 * A unicidade do nome da prova ENEM é POR CURSINHO.
 *
 * ⚠️ Antes era `getByFilter({ nome })`, global. O nome da prova ENEM é gerado
 * (`categoria ano edicao aplicacao`), então o primeiro cursinho a criar
 * "Enem Dia 1 2026 Regular 1" bloqueava **todos os outros e o admin** — com a
 * mensagem "Prova já esta cadastrada", que não diz que a prova é de outra
 * pessoa. Este arquivo existe porque aquele caminho não tinha teste nenhum.
 */
describe('EnemService — escopo do nome por cursinho', () => {
  const provaRepository = { getAtivaByNomeECursinho: jest.fn() };
  const service = new EnemService(
    {} as never,
    {} as never,
    provaRepository as never,
  );

  beforeEach(() => provaRepository.getAtivaByNomeECursinho.mockReset());

  it('procura a prova pelo par (nome, cursinho)', async () => {
    provaRepository.getAtivaByNomeECursinho.mockResolvedValue(null);

    await service.getByNomeECursinho('Enem Dia 1 2026 Regular 1', 'cur-1');

    expect(provaRepository.getAtivaByNomeECursinho).toHaveBeenCalledWith(
      'Enem Dia 1 2026 Regular 1',
      'cur-1',
    );
  });

  it('prova da plataforma procura com cursinho nulo', async () => {
    provaRepository.getAtivaByNomeECursinho.mockResolvedValue(null);

    await service.getByNomeECursinho('Enem Dia 1 2026 Regular 1', null);

    expect(provaRepository.getAtivaByNomeECursinho).toHaveBeenCalledWith(
      'Enem Dia 1 2026 Regular 1',
      null,
    );
  });
});
