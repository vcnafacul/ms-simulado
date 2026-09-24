import { BadRequestException } from '@nestjs/common';
import { EnemArea } from 'src/modules/questao/enums/enem-area.enum';
import { provasQueRecusamArea, validarAreaNaProva } from './area-da-prova';

const enem2026Dia2 = {
  nome: 'ENEM 2026 Dia 2',
  enemAreas: [EnemArea.BioExatas, EnemArea.Matematica],
};

describe('validarAreaNaProva (área ENEM × prova)', () => {
  it('área do dia da prova: aceita', () => {
    expect(() =>
      validarAreaNaProva(enem2026Dia2, EnemArea.Matematica),
    ).not.toThrow();
  });

  it('⚠️ área de OUTRO dia: recusa com 400', () => {
    // O caso do relato: questão de Linguagens entrando na ENEM Dia 2.
    expect(() => validarAreaNaProva(enem2026Dia2, EnemArea.Linguagens)).toThrow(
      BadRequestException,
    );
  });

  it('⚠️ a mensagem diz a área, a prova E o que a prova aceita', () => {
    // "Não permitida" sozinho manda a pessoa adivinhar o que corrigir.
    let mensagem = '';
    try {
      validarAreaNaProva(enem2026Dia2, EnemArea.Linguagens);
    } catch (e) {
      mensagem = (e as BadRequestException).message;
    }
    expect(mensagem).toContain('Linguagens');
    expect(mensagem).toContain('ENEM 2026 Dia 2');
    expect(mensagem).toContain('Ciências da Natureza, Matemática');
  });

  it('⚠️ prova sem `enemAreas` (customizada) aceita qualquer área', () => {
    // A customizada grava `enemAreas = []`: não restringe nada.
    for (const area of Object.values(EnemArea)) {
      expect(() =>
        validarAreaNaProva(
          { nome: 'Simulado do cursinho', enemAreas: [] },
          area,
        ),
      ).not.toThrow();
      expect(() =>
        validarAreaNaProva({ nome: 'Antiga', enemAreas: undefined }, area),
      ).not.toThrow();
    }
  });
});

describe('provasQueRecusamArea (mudança de área, todas as provas da questão)', () => {
  const enem2026Dia1 = {
    nome: 'ENEM 2026 Dia 1',
    enemAreas: [EnemArea.Linguagens, EnemArea.CienciasHumanas],
  };
  const custom = { nome: 'Simulado do cursinho', enemAreas: [] as string[] };

  it('lista só as provas ENEM que não aceitam a área', () => {
    expect(
      provasQueRecusamArea(
        [enem2026Dia1, enem2026Dia2, custom],
        EnemArea.Matematica,
      ).map((p) => p.nome),
    ).toEqual(['ENEM 2026 Dia 1']);
  });

  it('nenhuma recusa: lista vazia', () => {
    expect(
      provasQueRecusamArea([enem2026Dia1, custom], EnemArea.Linguagens),
    ).toEqual([]);
  });
});
