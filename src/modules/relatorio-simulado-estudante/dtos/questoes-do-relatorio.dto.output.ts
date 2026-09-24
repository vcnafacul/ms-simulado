import { ApiProperty } from '@nestjs/swagger';

export class QuestaoDoRelatorioDtoOutput {
  /**
   * Nulo em DOIS casos indistinguíveis um do outro:
   *
   * 1. A questão está vinculada à prova sem posição definida ainda (o admin
   *    tirou o número na aba Classificação). Na prática um simulado com
   *    questão sem número não é liberado, mas a leitura não presume.
   * 2. O vínculo questão↔prova foi DESFEITO depois que os cartões foram lidos
   *    (Etapa 11 — `removerDeProva`). As respostas continuam no `Historico` e
   *    a agregação por questão as conta normalmente, mas
   *    `getNumerosDasQuestoes` lê `Simulado.questoes` HOJE — a questão não
   *    está mais lá, então não entra no `Map`, e a linha chega com `numero:
   *    null` como se estivesse só sem posição.
   *
   * Em ambos, a questão vai para o fim da lista em vez de sumir — a tela não
   * pode assumir uma causa específica a partir só do `null`.
   */
  @ApiProperty({ required: true, nullable: true })
  numero: number | null;

  @ApiProperty() questaoId: string;

  @ApiProperty() respondentes: number;

  @ApiProperty() acertos: number;

  @ApiProperty() erros: number;

  /**
   * NÃO é "em branco". O ms-omr descarta tanto a questão não marcada quanto a
   * dupla marcação, e as duas chegam indistinguíveis — chamar de "em branco"
   * afirmaria o que ninguém verificou, e é o número que o professor usa para
   * decidir o que revisar em aula.
   */
  @ApiProperty() semLeitura: number;

  /**
   * Contagem por alternativa A–E. Contagem, não percentual: percentual
   * arredondado soma 99% ou 101%, e a tela divide melhor do que o ms adivinha.
   *
   * ⚠️ **Latente, mas documentado**: hoje o gravador só emite A–E ou ausente,
   * então isto nunca acontece na prática — mas o cálculo não impede. Um
   * `alternativaEstudante` fora de A–E (ex.: `'F'`, lixo de leitura) some
   * de `porAlternativa` (nenhuma chave A–E o conta) e ainda assim conta como
   * `erro` — então `acertos + erros + semLeitura === respondentes` continua
   * batendo, mas `sum(porAlternativa) !== respondentes - semLeitura`. Uma
   * string vazia (`''`) tem o mesmo destino: o `$ifNull` só pega chave
   * ausente/`null`, não `''`, então ela também vira `erro`, não `semLeitura`.
   * A tela NÃO pode assumir `sum(porAlternativa) + semLeitura === respondentes`.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description:
      'Contagem por alternativa. Chaves A, B, C, D, E — cada uma sempre presente, mesmo com 0.',
  })
  porAlternativa: Record<string, number>;

  /**
   * O gabarito, sem o qual as cinco contagens acima não são interpretáveis:
   * "51% marcaram B" é a turma acertando em peso ou meia turma caindo no mesmo
   * distrator, e são leituras opostas.
   *
   * Vem da cópia gravada em cada `Resposta` — o gabarito que VALEU naquela
   * aplicação, não o de `Questao.alternativa` hoje (que é `select: false` e
   * pode ter mudado desde então).
   *
   * ⚠️ **`null` em DOIS casos, e a tela não pode presumir qual:**
   *
   * 1. Nenhum histórico completo no recorte — não há gabarito para afirmar.
   * 2. Os históricos DISCORDAM: a questão foi editada entre duas aplicações do
   *    mesmo simulado, ou está duplicada nele (a corrida do `adicionarEmProva`,
   *    docs/cards/etapa-11/). O servidor loga o caso; devolver uma das letras
   *    faria o professor ler um gabarito errado como se fosse certo.
   *
   * ⚠️ Quando não é nulo, vale a invariante
   * `porAlternativa[alternativaCorreta] === acertos`.
   */
  @ApiProperty({ required: true, nullable: true })
  alternativaCorreta: string | null;

  /**
   * A correlação ponto-bisserial entre acertar esta questão e a nota da prova:
   * **a questão separa quem sabe de quem não sabe?**
   *
   * É a estatística que a dificuldade sozinha não dá. "22% acertaram" pode ser
   * uma questão difícil e boa — os 22% são quem foi bem na prova inteira — ou
   * uma questão quebrada, em que acertou quem chutou. As ações são opostas: dar
   * aula do conteúdo, ou corrigir o item e desconsiderá-lo.
   *
   * ⚠️ **Negativo é o sinal clássico de gabarito trocado** (os melhores errando
   * mais que os piores), e é a coisa mais acionável que este relatório aponta.
   *
   * Faixas usuais: `< 0,20` revisar · `≥ 0,30` boa · **negativa** suspeita de
   * gabarito. Quem traduz isso em rótulo é a tela (card 06) — aqui vai o número.
   *
   * ⚠️ **`null` NÃO é zero.** Zero diria "a questão não separa ninguém"; `null`
   * diz que não há como medir: menos de 10 com leitura, ou variância zero
   * (todos acertaram, ninguém acertou, ou a turma toda com a mesma nota).
   * Nunca vem `NaN`.
   */
  @ApiProperty({ required: true, nullable: true })
  discriminacao: number | null;

  /**
   * Quantos acertaram esta questão na BASE INTEIRA — todos os cursinhos, todas
   * as aplicações, os dois fluxos (card 16).
   *
   * ⚠️ **Outro ESCOPO, não outro cálculo.** `acertos` acima é do recorte do
   * relatório; este é global. É o que responde a pergunta que o recorte não
   * pode responder: *"minha turma foi mal nesta questão, ou a questão é difícil
   * para todo mundo?"*. 22% da turma contra 24% da base muda a conclusão de
   * "preciso dar essa aula" para "a questão é dura mesmo".
   *
   * ⚠️ **Contagem, e não percentual** — mesma razão do `porAlternativa`: o
   * percentual arredondado esconde a base, e a base é metade da informação.
   * Quem divide é a tela.
   *
   * ⚠️ **Vem da `Questao`, não do histórico**, e por isso depende da correção
   * do card 21 (escrita) E da execução do sync do card 22 (passado). Antes
   * disso `baseGeral` contava APRESENTAÇÕES em vez de respostas e o
   * reprocessamento contava duas vezes — medido em homologação: **0 de 181**
   * questões batiam com o histórico.
   */
  @ApiProperty() acertosGeral: number;

  /**
   * Quantas respostas esta questão recebeu na base inteira — o denominador de
   * `acertosGeral`.
   *
   * ⚠️ **Tem de chegar à tela junto do percentual.** "24%" sozinho não diz se
   * são 1.847 respostas ou 12, e as duas leituras são opostas: a primeira é
   * dificuldade da questão, a segunda é ruído. É a tela que decide o piso
   * abaixo do qual não exibe nada.
   *
   * ⚠️ `0` é uma afirmação verdadeira — ninguém respondeu — e é diferente de
   * "não sei". Quem não sabe é a tela, quando a base é pequena demais.
   */
  @ApiProperty() baseGeral: number;

  /**
   * Esta questão é uma **versão** de outra (card 29).
   *
   * ⚠️ **Existe para EXPLICAR a base pequena, não para somar.** A contagem
   * global é da questão, e não da linhagem — decisão do card 29: como
   * "correção" edita in-place e só "nova versão" cria uma entidade nova, toda
   * versão nasce de uma mudança substantiva, e somar a família somaria textos
   * diferentes.
   *
   * O custo dessa decisão é a base encolher a cada versão. Este booleano é o
   * que permite à tela dizer *"a base é pequena porque a questão é nova"* em vez
   * de deixar a coluna sumir sem explicação.
   *
   * ⚠️ **Booleano, e não o id da origem**: mandar o id convidaria a buscar a
   * questão antiga e somar os números.
   */
  @ApiProperty() ehVersao: boolean;
}

export class QuestoesDoRelatorioDtoOutput {
  @ApiProperty({ type: [QuestaoDoRelatorioDtoOutput] })
  questoes: QuestaoDoRelatorioDtoOutput[];
}
