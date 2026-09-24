import { documentoDaCopia } from './duplicarQuestao';
import { Status } from './enums/status.enum';
import { TipoOrigem } from './enums/tipo-origem.enum';
import { Questao } from './questao.schema';

const original = (over: Record<string, unknown> = {}) =>
  ({
    _id: 'q1',
    textoQuestao: 'enunciado',
    pergunta: 'pergunta',
    textoAlternativaA: 'a',
    alternativa: 'C',
    enemArea: 'Matemática',
    materia: 'm1',
    frente1: 'f1',
    imageId: 'img-123.png',
    assets: ['assets/x.png'],
    files: ['f.pdf'],
    contentFormat: 'markdown',
    status: Status.Approved,
    acertos: 8,
    quantidadeResposta: 10,
    quantidadeSimulado: 3,
    provaBase: 'p1',
    origem: null,
    ...over,
  }) as unknown as Questao;

describe('documentoDaCopia (card 25)', () => {
  it('⚠️ as estatísticas nascem ZERADAS — a original fica com as dela', () => {
    /*
      É a decisão central do card. "A questão foi respondida 10 vezes, 8
      acertaram, aí eu edito — aquela morreu daquele jeito?" **Não morre:** os
      8/10 continuam na original e continuam VERDADEIROS, porque descrevem o
      conteúdo que aquelas 10 pessoas leram. A cópia começa em zero porque
      ninguém respondeu a cópia.

      Um sistema de versões herdaria os números por reflexo, e aí "8 de 10"
      passaria a descrever um texto que ninguém viu.
    */
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.acertos).toBe(0);
    expect(c.quantidadeResposta).toBe(0);
    expect(c.quantidadeSimulado).toBe(0);
  });

  it('⚠️ nasce `Pending`, nunca `Approved`', () => {
    // É o que impede uma cópia não revisada de entrar em prova.
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.status).toBe(Status.Pending);
  });

  it('⚠️ nasce ÓRFÃ — sem prova de origem', () => {
    // É o que distingue duplicar de versionar (card 26): lá as provas passam a
    // apontar a sucessora; aqui elas não mudam.
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.provaBase).toBeNull();
  });

  it('a linhagem aponta para a questão duplicada', () => {
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.origem).toBe('q1');
  });

  it('⚠️ NÃO herda o avô — a origem é sempre o pai direto', () => {
    /*
      A linhagem é guardada em UM nível; a cadeia completa é derivável subindo
      por `origem`. Herdar a raiz aqui criaria um segundo campo a manter em
      acordo com o primeiro.
    */
    const c = documentoDaCopia(TipoOrigem.copia, original({ origem: 'avo' }));

    expect(c.origem).toBe('q1');
  });

  it('⚠️ o vínculo carrega o TIPO — cópia e versão não se confundem (card 32)', () => {
    /*
      Cópia é irmã ("quero outra parecida"); versão é a sucessora, que substituiu
      a original nas provas. Com o mesmo `origem` e nada mais, as duas caíam na
      mesma lista e o `ehVersao` do card 29 dava true para cópia.
    */
    expect(documentoDaCopia(TipoOrigem.copia, original()).tipoOrigem).toBe(
      TipoOrigem.copia,
    );
    expect(documentoDaCopia(TipoOrigem.versao, original()).tipoOrigem).toBe(
      TipoOrigem.versao,
    );
  });

  it('⚠️ NÃO herda o tipo do pai — a cópia de uma versão é cópia', () => {
    const c = documentoDaCopia(
      TipoOrigem.copia,
      original({ origem: 'q0', tipoOrigem: TipoOrigem.versao }),
    );

    expect(c.tipoOrigem).toBe(TipoOrigem.copia);
  });

  it('⚠️ não carrega o `_id` da original', () => {
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect('_id' in c).toBe(false);
  });

  it('herda conteúdo E classificação', () => {
    // Partir de uma questão existente é o ponto de duplicar: sem a
    // classificação, a pessoa reclassifica tudo à mão e o lastro não economiza.
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.textoQuestao).toBe('enunciado');
    expect(c.enemArea).toBe('Matemática');
    expect(c.materia).toBe('m1');
    expect(c.frente1).toBe('f1');
    expect(c.contentFormat).toBe('markdown');
  });

  it('⚠️ herda o GABARITO — cópia sem gabarito não é questão', () => {
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.alternativa).toBe('C');
  });

  it('⚠️ COMPARTILHA as refs de imagem, em vez de duplicar o arquivo', () => {
    /*
      São keys no S3/R2. Duplicar o arquivo dobraria o armazenamento por uma
      cópia que na maioria das vezes muda só o texto.

      ⚠️ E isso tem consequência: trocar o arquivo numa key muda as DUAS
      questões. O isolamento vale para o texto e não para a imagem enquanto o
      `uploadAsset` puder sobrescrever key — o mesmo furo do card 23.
    */
    const c = documentoDaCopia(TipoOrigem.copia, original());

    expect(c.imageId).toBe('img-123.png');
    expect(c.assets).toEqual(['assets/x.png']);
    expect(c.files).toEqual(['f.pdf']);
  });

  it('campo novo no schema entra na cópia por padrão', () => {
    // A lista é do que fica DE FORA: conteúdo e classificação novos devem ser
    // herdados sem ninguém precisar lembrar de acrescentá-los aqui.
    const c = documentoDaCopia(
      TipoOrigem.copia,
      original({ campoFuturo: 'x' }),
    );

    expect((c as Record<string, unknown>).campoFuturo).toBe('x');
  });
});
