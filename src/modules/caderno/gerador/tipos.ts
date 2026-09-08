import { Status } from '../../questao/enums/status.enum';

/**
 * Uma imagem a materializar no zip, com a origem preservada.
 *
 * ⚠️ O discriminador existe porque **quase 100% do acervo aponta para fora**
 * (`![](https://enem.dev/…png)`), e não para o nosso R2. O gerador é puro e
 * não baixa nada: ele só diz de onde cada imagem vem, e o card 03 materializa
 * as duas origens no mesmo `assets/NN.ext`.
 *
 * O card 08 ataca a causa — repatriar o acervo para o nosso bucket — e a
 * métrica de sucesso dele é este tipo: zero `origem: 'url'`.
 */
export type ImagemRef =
  | { origem: 'r2'; key: string; arquivo: string }
  | { origem: 'url'; url: string; arquivo: string };

export interface CadernoGerado {
  /** o conteudo.tex inteiro, incluindo o bloco de avisos no topo */
  conteudo: string;
  /** o metadados.tex inteiro */
  metadados: string;
  imagens: ImagemRef[];
  avisos: string[];
  /** números efetivamente impressos */
  questoesIncluidas: number[];
  /** só no modo rascunho; [] no normal */
  questoesFaltantes: number[];
}

/**
 * A questão na forma mínima que o caderno exige.
 *
 * ⚠️ **`alternativa` não está aqui, e é de propósito.** `\CorrectChoice`
 * renderiza idêntico a `\choice` sem a opção `answers` da documentclass —
 * então o gabarito não apareceria no PDF, mas estaria em texto claro dentro do
 * `conteudo.tex`, que a pessoa sobe num projeto do Overleaf, e projeto do
 * Overleaf se compartilha por link. O vazamento seria invisível justamente
 * porque o PDF fica igual.
 *
 * Manter o campo fora do tipo faz o compilador garantir isso, em vez de
 * depender de alguém lembrar. A aplicação é a fonte da verdade do gabarito.
 *
 * ⚠️ `imageId` e `imageAlternativaA..E` também ficam de fora, por decisão do
 * usuário: na prova gerada entram só enunciado, pergunta e alternativas em
 * texto — imagem, só a que estiver dentro do texto.
 */
export interface QuestaoParaCaderno {
  status?: Status;
  textoQuestao?: string;
  pergunta?: string;
  textoAlternativaA?: string;
  textoAlternativaB?: string;
  textoAlternativaC?: string;
  textoAlternativaD?: string;
  textoAlternativaE?: string;
}

/**
 * O simulado na forma mínima que o caderno exige — mesmo espírito do
 * `SimuladoBloqueavel` em `simulado/helpers/bloqueado.ts`. Não acoplar o
 * gerador ao schema Mongoose inteiro.
 */
export interface SimuladoParaCaderno {
  nome: string;
  categoria: {
    nome: string;
    duracao: number;
    /** `null` em categoria custom, que tem quantidade livre */
    quantidadeTotalQuestao?: number | null;
  };
  questoes: { questao: QuestaoParaCaderno; numero: number | null }[];
}

/** As cinco letras, na ordem em que são impressas. */
export const LETRAS = ['A', 'B', 'C', 'D', 'E'] as const;
