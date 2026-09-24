import { BadRequestException } from '@nestjs/common';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { Enem2010_2017Factory } from './enem_2010_2016_factory';
import { Enem2017PlusFactory } from './enem_2017_plus_factory';

/**
 * A área da questão tem de caber na prova ENEM — nas DUAS fábricas, nos TRÊS
 * caminhos que põem questão em prova (card 01 de `area-enem-da-questao`).
 *
 * ⚠️ O que cada teste afirma é que a recusa vem **antes de qualquer escrita**:
 * nem `create`, nem sessão, nem vínculo. Recusar depois deixaria órfã.
 */
const fabricas = [
  {
    nome: 'Enem2017PlusFactory',
    Classe: Enem2017PlusFactory,
    // 2017+: Dia 2 = Natureza + Matemática.
    dia2: [EnemArea.BioExatas, EnemArea.Matematica],
    foraDoDia2: EnemArea.Linguagens,
  },
  {
    nome: 'Enem2010_2017Factory',
    Classe: Enem2010_2017Factory,
    // 2010–2016: Dia 2 = Linguagens + Matemática.
    dia2: [EnemArea.Linguagens, EnemArea.Matematica],
    foraDoDia2: EnemArea.CienciasHumanas,
  },
] as const;

const montar = (
  Classe: any,
  enemAreas: readonly string[],
  areaDaQuestao: string,
) => {
  const prova = {
    _id: { toString: () => 'p2' },
    nome: 'ENEM 2026 Dia 2',
    enemAreas,
    simulados: [] as unknown[],
  };
  const questaoRepository = {
    create: jest.fn(),
    startSession: jest.fn(),
    getByIdToUpdate: jest.fn().mockResolvedValue({
      _id: 'q1',
      enemArea: areaDaQuestao,
      frente1: { _id: { toString: () => 'f-comum' } },
    }),
    findProvaAtual: jest.fn().mockResolvedValue(undefined),
    canInsertQuestion: jest.fn().mockResolvedValue(true),
  };
  const provaRepository = {
    getById: jest.fn().mockResolvedValue(prova),
    addQuestion: jest.fn(),
  };
  const frenteRepository = {
    getByFilter: jest
      .fn()
      .mockImplementation(({ nome }: { nome: string }) =>
        Promise.resolve({ _id: { toString: () => `f-${nome}` } }),
      ),
  };
  const simuladoService = { addQuestionSimulados: jest.fn() };
  const enemService = { validate: jest.fn().mockResolvedValue(undefined) };
  const fabrica = new Classe(
    {} as any,
    questaoRepository,
    provaRepository,
    frenteRepository,
    simuladoService,
    {} as any,
    enemService,
  );
  const nadaEscrito = () => {
    expect(questaoRepository.create).not.toHaveBeenCalled();
    expect(questaoRepository.startSession).not.toHaveBeenCalled();
    expect(provaRepository.addQuestion).not.toHaveBeenCalled();
    expect(simuladoService.addQuestionSimulados).not.toHaveBeenCalled();
  };
  return { fabrica, nadaEscrito };
};

const dto = (enemArea: string) =>
  ({
    _id: 'q1',
    prova: 'p2',
    numero: 50,
    enemArea,
    frente1: 'f-comum',
    materia: 'm1',
  }) as any;

describe.each(fabricas)('$nome — área × prova ENEM', (f) => {
  it('⚠️ createQuestion recusa área de outro dia, antes de criar', async () => {
    const { fabrica, nadaEscrito } = montar(f.Classe, f.dia2, f.foraDoDia2);

    await expect(fabrica.createQuestion(dto(f.foraDoDia2))).rejects.toThrow(
      BadRequestException,
    );
    nadaEscrito();
  });

  it('⚠️ addQuestaoExistenteAProva recusa — o caso do relato', async () => {
    // Questão cadastrada sem prova, depois adicionada à ENEM Dia 2.
    const { fabrica, nadaEscrito } = montar(f.Classe, f.dia2, f.foraDoDia2);

    await expect(
      fabrica.addQuestaoExistenteAProva('q1', 'p2', 50),
    ).rejects.toThrow(/não é permitida na prova ENEM 2026 Dia 2/);
    nadaEscrito();
  });

  it('⚠️ updateQuestion recusa mudar para área de outro dia', async () => {
    const { fabrica, nadaEscrito } = montar(f.Classe, f.dia2, f.dia2[0]);

    await expect(fabrica.updateQuestion(dto(f.foraDoDia2))).rejects.toThrow(
      BadRequestException,
    );
    nadaEscrito();
  });

  it('área do dia passa pela checagem', async () => {
    // Não afirma o resto do fluxo — só que a checagem não recusa o que cabe.
    const { fabrica } = montar(f.Classe, f.dia2, f.dia2[1]);

    await expect(
      fabrica.addQuestaoExistenteAProva('q1', 'p2', 50),
    ).rejects.not.toThrow(/não é permitida/);
  });
});
