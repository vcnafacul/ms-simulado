import { Logger } from '@nestjs/common';
import { FalhaHistorico } from '../types/falha';
import { AcaoSugerida, CodigoFalhaInterno } from './codigo-falha';

const logger = new Logger('MapaFalha');

export interface FalhaDescrita extends FalhaHistorico {
  descricao: string;
  acaoSugerida: AcaoSugerida;
}

interface EntradaMapa {
  descricao: string;
  acaoSugerida: AcaoSugerida;
}

/**
 * Tabela explícita — não `switch` espalhado. As descrições são lidas por um
 * coordenador de cursinho: sem jargão de OMR, e dizendo o que fazer.
 *
 * Os oito primeiros vêm do ms-omr; o contrato é o README daquele repo.
 */
const MAPA: Record<string, EntradaMapa> = {
  imagem_nao_encontrada: {
    descricao: 'A foto do cartão não foi encontrada. Envie novamente.',
    acaoSugerida: AcaoSugerida.ReenviarFoto,
  },
  template_ausente: {
    descricao: 'O modelo de cartão deste simulado não está publicado.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  cartao_nao_detectado: {
    descricao:
      'Não foi possível localizar o cartão na foto. Refotografe com o cartão inteiro visível e boa iluminação.',
    acaoSugerida: AcaoSugerida.ReenviarFoto,
  },
  leitura_ausente: {
    descricao:
      'O cartão foi processado, mas nenhuma marcação foi lida. Refotografe.',
    acaoSugerida: AcaoSugerida.ReenviarFoto,
  },
  motor_falhou: {
    descricao: 'Erro interno na leitura do cartão.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  motor_timeout: {
    descricao:
      'A leitura excedeu o tempo limite depois de três tentativas. Tente processar novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
  armazenamento_indisponivel: {
    descricao:
      'Não foi possível acessar o arquivo do cartão. Tente processar novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
  erro_interno: {
    descricao: 'Erro inesperado ao processar o cartão.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.OmrIndisponivel]: {
    descricao: 'Não foi possível acionar a leitura do cartão. Tente novamente.',
    acaoSugerida: AcaoSugerida.Reprocessar,
  },
  [CodigoFalhaInterno.SimuladoNaoEncontrado]: {
    descricao: 'O simulado deste cartão não foi encontrado.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.RespostasAusentes]: {
    descricao: 'O cartão foi lido, mas nenhuma resposta chegou para o cálculo.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.SimuladoSemQuestoes]: {
    descricao: 'Este simulado não tem questões cadastradas.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
  [CodigoFalhaInterno.ErroNoProcessamento]: {
    descricao: 'Erro ao calcular o resultado do cartão.',
    acaoSugerida: AcaoSugerida.FalarComSuporte,
  },
};

export const CODIGOS_MAPEADOS = Object.keys(MAPA);

/**
 * Código desconhecido não pode virar tela em branco: mostra algo útil e deixa
 * rastro no log, senão um código novo do ms-omr some em silêncio.
 * `FalarComSuporte` é o fallback seguro — sem saber o que houve, prometer que
 * uma segunda tentativa resolve seria chute.
 */
const FALLBACK: EntradaMapa = {
  descricao: 'Não foi possível ler o cartão.',
  acaoSugerida: AcaoSugerida.FalarComSuporte,
};

export function descreverFalha(
  falha?: FalhaHistorico,
): FalhaDescrita | undefined {
  if (!falha) return undefined;

  const entrada = MAPA[falha.codigo];
  if (!entrada) {
    logger.warn(`código de falha não mapeado: ${falha.codigo}`);
    return { ...falha, ...FALLBACK };
  }
  return { ...falha, ...entrada };
}
