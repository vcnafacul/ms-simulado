import { ForbiddenException } from '@nestjs/common';
import { Ator } from 'src/shared/ator/ator';
import {
  QuestaoService,
  textoAreaFrenteEmProvaOficial,
} from './questao.service';

/**
 * tickets/023, card 17 (R10): questão numa prova de categoria fora de uso
 * (`selecionavel: false`) só muda de área/frente1 pela equipe da plataforma.
 */
const editor: Ator = {
  userId: 'u',
  cursinhoId: 'A',
  admin: false,
  editorCursinho: true,
};
const admin: Ator = { ...editor, cursinhoId: null, admin: true };

function montar(provas: { provaNome: string; selecionavel: boolean }[]) {
  const questao = {
    _id: 'q1',
    enemArea: 'Matemática',
    frente1: { _id: { toString: () => 'f1' } },
    alternativa: 'A',
  };
  const repository = {
    getByIdToUpdate: jest.fn().mockResolvedValue(questao),
    findProvasContendoMany: jest
      .fn()
      .mockResolvedValue(
        new Map([
          ['q1', provas.map((p, i) => ({ provaId: `p${i}`, numero: 1, ...p }))],
        ]),
      ),
    findProvasContendo: jest.fn().mockResolvedValue([]),
    updateClassificacao: jest.fn(),
  };
  const service = new QuestaoService(
    repository as any,
    { assertPodeComporProva: jest.fn(), syncNumero: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { create: jest.fn() } as any,
    {} as any,
    { getFactory: jest.fn() } as any,
  );
  return { service, repository };
}

const oficial = { provaNome: 'ENEM 2023 Dia 2', selecionavel: false };
const doCursinho = { provaNome: 'Simulado A', selecionavel: true };

describe('área/frente1 em prova oficial (023 · 17)', () => {
  it.each([
    ['área', { enemArea: 'Linguagens', frente1: 'f1' }],
    ['frente1', { enemArea: 'Matemática', frente1: 'f2' }],
  ])(
    'editor de cursinho muda a %s → 403 com a regra, nada escrito',
    async (_n, mudanca) => {
      const { service, repository } = montar([doCursinho, oficial]);
      const erro = await service
        .updateClassificacao('q1', mudanca as any, editor)
        .catch((e) => e);
      expect(erro).toBeInstanceOf(ForbiddenException);
      expect(erro.message).toBe(
        textoAreaFrenteEmProvaOficial(['ENEM 2023 Dia 2']),
      );
      expect(repository.updateClassificacao).not.toHaveBeenCalled();
    },
  );

  it('a equipe da plataforma (criarQuestao) pode', async () => {
    const { service } = montar([oficial]);
    const erro = await service
      .updateClassificacao(
        'q1',
        { enemArea: 'Linguagens', frente1: 'f1' } as any,
        admin,
      )
      .catch((e) => e);
    expect(erro).not.toBeInstanceOf(ForbiddenException);
  });

  it('só em provas de cursinho: o editor muda a frente1', async () => {
    const { service } = montar([doCursinho]);
    const erro = await service
      .updateClassificacao(
        'q1',
        { enemArea: 'Matemática', frente1: 'f2' } as any,
        editor,
      )
      .catch((e) => e);
    expect(erro).not.toBeInstanceOf(ForbiddenException);
  });

  it('mudar só a matéria numa questão de prova oficial é livre (R4)', async () => {
    const { service } = montar([oficial]);
    const erro = await service
      .updateClassificacao(
        'q1',
        { enemArea: 'Matemática', frente1: 'f1', materia: 'm2' } as any,
        editor,
      )
      .catch((e) => e);
    expect(erro).not.toBeInstanceOf(ForbiddenException);
  });
});
