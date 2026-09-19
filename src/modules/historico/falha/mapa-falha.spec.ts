import { Logger } from '@nestjs/common';
import { AcaoSugerida, CodigoFalhaInterno } from './codigo-falha';
import { CODIGOS_MAPEADOS, descreverFalha } from './mapa-falha';

describe('mapa de falhas', () => {
  it('cobre os oito códigos do ms-omr e os cinco próprios', () => {
    expect(CODIGOS_MAPEADOS).toEqual(
      expect.arrayContaining([
        // vindos do ms-omr (o README daquele repo é o contrato)
        'imagem_nao_encontrada',
        'template_ausente',
        'cartao_nao_detectado',
        'leitura_ausente',
        'motor_falhou',
        'motor_timeout',
        'armazenamento_indisponivel',
        'erro_interno',
        // produzidos aqui
        'omr_indisponivel',
        'simulado_nao_encontrado',
        'respostas_ausentes',
        'simulado_sem_questoes',
        'erro_no_processamento',
      ]),
    );
    expect(CODIGOS_MAPEADOS).toHaveLength(13);
  });

  it('todo código que este serviço produz está mapeado', () => {
    for (const codigo of Object.values(CodigoFalhaInterno)) {
      expect(CODIGOS_MAPEADOS).toContain(codigo);
    }
  });

  it('descreve a falha sem perder código nem detalhe', () => {
    const d = descreverFalha({
      codigo: 'cartao_nao_detectado',
      detalhe: 'OMRChecker não gerou CSV de Results',
    });
    expect(d).toEqual({
      codigo: 'cartao_nao_detectado',
      detalhe: 'OMRChecker não gerou CSV de Results',
      descricao: expect.stringContaining('Não foi possível localizar o cartão'),
      acaoSugerida: AcaoSugerida.ReenviarFoto,
    });
  });

  it('o que não é culpa da foto sugere reprocessar, não refotografar', () => {
    for (const codigo of [
      'motor_timeout',
      'armazenamento_indisponivel',
      'omr_indisponivel',
    ]) {
      expect(descreverFalha({ codigo })!.acaoSugerida).toBe(
        AcaoSugerida.Reprocessar,
      );
    }
  });

  it('nenhuma descrição vaza jargão de OMR para o coordenador', () => {
    for (const codigo of CODIGOS_MAPEADOS) {
      expect(descreverFalha({ codigo })!.descricao).not.toMatch(
        /OMR|CSV|stderr|template\.json/i,
      );
    }
  });

  it('código desconhecido cai no fallback E vai para o log', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const d = descreverFalha({ codigo: 'codigo_que_nao_existe', detalhe: 'x' });

    expect(d).toEqual({
      codigo: 'codigo_que_nao_existe',
      detalhe: 'x',
      descricao: 'Não foi possível ler o cartão.',
      // sem saber o que houve, prometer que tentar de novo resolve seria chute
      acaoSugerida: AcaoSugerida.FalarComSuporte,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('codigo_que_nao_existe'),
    );

    warn.mockRestore();
  });

  it('sem falha, não inventa uma', () => {
    expect(descreverFalha(undefined)).toBeUndefined();
  });
});
