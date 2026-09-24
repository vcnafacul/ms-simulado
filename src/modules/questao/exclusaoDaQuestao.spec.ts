import { Status } from './enums/status.enum';
import {
  EstadoParaExclusao,
  MotivoParaNaoExcluir as M,
  motivosParaNaoExcluir,
  TEXTO_DO_MOTIVO,
} from './exclusaoDaQuestao';

/** Uma questão que passa em TODAS as condições — cada teste quebra uma só. */
const orfa = (over: Partial<EstadoParaExclusao> = {}): EstadoParaExclusao => ({
  status: Status.Pending,
  congelada: false,
  respondida: false,
  emProva: false,
  emSimulado: false,
  temFilhas: false,
  ...over,
});

describe('motivosParaNaoExcluir (card 33)', () => {
  it('questão órfã, Pending, sem rastro: pode excluir', () => {
    expect(motivosParaNaoExcluir(orfa())).toEqual([]);
  });

  it('`Rejected` também pode', () => {
    expect(motivosParaNaoExcluir(orfa({ status: Status.Rejected }))).toEqual(
      [],
    );
  });

  it('⚠️ `Approved` NUNCA — mesmo órfã e sem resposta', () => {
    /*
      Decisão de produto: uma questão aprovada e nunca usada é catálogo
      válido, e alguém pode estar contando com ela para a próxima prova.
    */
    expect(motivosParaNaoExcluir(orfa({ status: Status.Approved }))).toEqual([
      M.aprovada,
    ]);
  });

  it('⚠️ respondida não se exclui — é o que o histórico aponta', () => {
    expect(motivosParaNaoExcluir(orfa({ respondida: true }))).toEqual([
      M.respondida,
    ]);
  });

  it('em prova não se exclui', () => {
    expect(motivosParaNaoExcluir(orfa({ emProva: true }))).toEqual([M.emProva]);
  });

  it('⚠️ em simulado não se exclui, mesmo fora de qualquer prova', () => {
    /*
      `Prova.questoes` e `Simulado.questoes` são arrays independentes — a
      questão pode estar num simulado sem estar na prova se algo ficou
      inconsistente. Por isso as duas coleções.
    */
    expect(motivosParaNaoExcluir(orfa({ emSimulado: true }))).toEqual([
      M.emSimulado,
    ]);
  });

  it('⚠️ origem de cópia OU de versão não se exclui', () => {
    // "Não pode excluir se ela tem rastro" — qualquer tipo de filha.
    expect(motivosParaNaoExcluir(orfa({ temFilhas: true }))).toEqual([
      M.origemDeOutras,
    ]);
  });

  it('congelada não se exclui', () => {
    expect(motivosParaNaoExcluir(orfa({ congelada: true }))).toEqual([
      M.congelada,
    ]);
  });

  it('⚠️ as condições são E: devolve TODOS os motivos, não só o primeiro', () => {
    /*
      A recusa diz qual condição falhou — e se falham três, as três. Parar no
      primeiro faria a pessoa resolver um, tentar de novo, e descobrir o
      próximo.
    */
    expect(
      motivosParaNaoExcluir(
        orfa({ status: Status.Approved, emProva: true, respondida: true }),
      ),
    ).toEqual([M.aprovada, M.respondida, M.emProva]);
  });

  it('todo motivo tem texto', () => {
    for (const m of Object.values(M)) {
      expect(TEXTO_DO_MOTIVO[m]).toBeTruthy();
    }
  });
});
