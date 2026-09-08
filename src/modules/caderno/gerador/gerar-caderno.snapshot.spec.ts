import { Status } from '../../questao/enums/status.enum';
import { gerarCaderno } from './gerar-caderno';
import { SIMULADO } from './simulado-exemplo';
import { QuestaoParaCaderno } from './tipos';

describe('gerarCaderno — snapshot', () => {
  it('conteudo.tex do fixture completo', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).conteudo).toMatchSnapshot();
  });

  it('metadados.tex do fixture completo', () => {
    expect(
      gerarCaderno(SIMULADO, { draft: false }).metadados,
    ).toMatchSnapshot();
  });

  it('metadados.tex no modo rascunho', () => {
    expect(gerarCaderno(SIMULADO, { draft: true }).metadados).toMatchSnapshot();
  });

  it('as imagens coletadas', () => {
    expect(gerarCaderno(SIMULADO, { draft: false }).imagens).toMatchSnapshot();
  });
});

describe('gerarCaderno — o gabarito não existe no tipo', () => {
  it('QuestaoParaCaderno não aceita `alternativa`', () => {
    // Garantia de compilador, não de disciplina: se alguém acrescentar o campo
    // ao tipo, este teste para de compilar, e o motivo está no docblock de
    // QuestaoParaCaderno.
    //
    // ⚠️ Precisa ser um objeto literal ATRIBUÍDO DIRETO ao tipo. TypeScript só
    // reclama de propriedade extra em literal; passando por uma variável
    // intermediária a tipagem estrutural aceita o campo a mais, e a diretiva
    // de erro esperado abaixo vira "unused" — o teste falha por outro motivo.
    // (Nota: por isso esta explicação evita escrever a diretiva por extenso
    // no início de uma linha de comentário — o compilador não distingue.)
    const q: QuestaoParaCaderno = {
      status: Status.Approved,
      textoQuestao: 'Enunciado.',
      // @ts-expect-error `alternativa` não pertence a QuestaoParaCaderno
      alternativa: 'B',
    };
    expect(q).toBeDefined();
  });
});
