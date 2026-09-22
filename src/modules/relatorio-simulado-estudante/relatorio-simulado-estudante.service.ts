import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HistoricoStatus } from '../historico/enums/historico-status.enum';
import { MateriaAproveitamento } from '../historico/types/aproveitamento';
import { descreverFalha } from '../historico/falha/mapa-falha';
import { SimuladoRepository } from '../simulado/simulado.repository';
import {
  LinhaRelatorioDtoOutput,
  RelatorioSimuladoDtoOutput,
  MateriaDoEstudanteDtoOutput,
} from './dtos/relatorio-simulado.dto.output';
import {
  DetalheDoEstudanteDtoOutput,
  ResultadoDaQuestao,
} from './dtos/detalhe-do-estudante.dto.output';
import {
  QuestaoDoRelatorioDtoOutput,
  QuestoesDoRelatorioDtoOutput,
} from './dtos/questoes-do-relatorio.dto.output';
import { SimuladosComCartaoDtoOutput } from './dtos/simulados-com-cartao.dto.output';
import {
  LinhaComHistorico,
  RelatorioSimuladoEstudanteRepository,
} from './relatorio-simulado-estudante.repository';

/**
 * Copia matéria/frente para o formato do DTO, **sem o `materia` de dentro de
 * cada frente**.
 *
 * ⚠️ Mapear, e não devolver o subdocumento cru. Duas razões, e a segunda foi
 * medida:
 *
 * 1. O cru traz `materia` em cada frente — um id que é puro eco, porque a
 *    frente já está ANINHADA na matéria dona. São 27 ObjectIds por estudante
 *    dizendo o que a posição no objeto já diz.
 * 2. Em 100 estudantes × 9 matérias × 3 frentes isso são **418 KB contra
 *    320 KB** — 23% do payload, de graça, só por não repetir o óbvio.
 *
 * ⚠️ E é o mapa que faz o contrato ser o DTO: `@ApiProperty` é documentação,
 * não filtro. Sem este `map` o Swagger anunciaria um formato e a rota
 * devolveria outro.
 */
function enxugarMaterias(
  materias: MateriaAproveitamento[],
): MateriaDoEstudanteDtoOutput[] {
  return materias.map((m) => ({
    id: m.id,
    nome: m.nome,
    aproveitamento: m.aproveitamento,
    frentes: (m.frentes ?? []).map((f) => ({
      id: f.id,
      nome: f.nome,
      aproveitamento: f.aproveitamento,
    })),
  }));
}

@Injectable()
export class RelatorioSimuladoEstudanteService {
  private readonly logger = new Logger(RelatorioSimuladoEstudanteService.name);

  constructor(
    private readonly repository: RelatorioSimuladoEstudanteRepository,
    private readonly simuladoRepository: SimuladoRepository,
  ) {}

  async consultar(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
    /** A turma ATUAL, quando o chamador a resolve. Ver card 18. */
    usuarios?: string[];
  }): Promise<RelatorioSimuladoDtoOutput> {
    const [linhas, total] = await Promise.all([
      this.repository.buscarPorRecorte(params),
      // do CURSINHO, não da turma: é o denominador do rodapé
      this.repository.contarDoCursinho(params.simuladoId, params.cursinhoId),
    ]);

    return {
      // `flatMap`: uma linha órfã vira `[]` e some, sem derrubar as demais —
      // ver `montarLinha`.
      linhas: linhas.flatMap((l) => this.montarLinha(l, params.cursinhoId)),
      totalEstudantesComCartaoNoCursinho: total,
    };
  }

  /**
   * ⚠️ `descreverFalha` é chamado AQUI, e nada no código força isso — é a
   * contrapartida de o card 01 derivar a descrição na service em vez de num
   * virtual do Mongoose. Sem ele a tela recebe `cartao_nao_detectado` cru.
   *
   * `l.historico` pode vir `null`: o `Historico` referenciado foi apagado
   * depois do vínculo (a escrita tolera essa órfã de propósito — ver
   * `cartao-historico.service.ts`). Uma linha só não pode derrubar o
   * relatório do cursinho inteiro: ela é ignorada (`[]`) e o log guarda o
   * rastro para investigar. O estudante não some da tela — o card 04 monta
   * o relatório a partir dos ESTUDANTES e faz left join com estas linhas, então
   * quem ficou sem linha aqui aparece lá como "não enviou".
   */
  private montarLinha(
    l: LinhaComHistorico,
    cursinhoId: string,
  ): LinhaRelatorioDtoOutput[] {
    const h = l.historico;
    if (!h) {
      this.logger.error(
        `histórico inexistente para o usuário ${l.usuario} (cursinho ${cursinhoId}) — linha ignorada no relatório`,
      );
      return [];
    }

    /*
      ⚠️ **A nota inteira é campo VELHO fora de `completed`**, e por isso passa
      pelo mesmo gate que `respostas` e `falha` já têm no `consultarDetalhe`.

      `completeProcessing` é o único escritor de `aproveitamento` e ninguém
      nunca o desfaz — `marcarFalha` e `prepararParaProcessamento` não tocam
      nele. Um cartão que completou, reprocessou e falhou carrega a nota da
      rodada ANTERIOR, e devolvê-la afirma que a leitura de agora produziu o
      que ela não produziu.

      ⚠️ O gate é novo também para `aproveitamentoGeral`, que não tinha: o ms
      mandava a nota velha e o client (`leituraVale`), a exportação e o resumo
      da api compensavam cada um por sua conta. Consertar na origem não quebra
      nenhum dos três — todos já tratam ausência —, e eles seguem valendo como
      defesa em profundidade.
    */
    const leituraConcluida = h.status === HistoricoStatus.Completed;
    const aproveitamento = leituraConcluida ? h.aproveitamento : undefined;

    return [
      {
        usuario: l.usuario,
        turmaId: l.turmaId,
        historicoId: h._id.toString(),
        status: h.status,
        cartaoCode: h.cartaoCode,
        questoesRespondidas: h.questoesRespondidas,
        // ausente, não zero — ver o docblock do DTO
        aproveitamentoGeral: aproveitamento?.geral,
        // ⚠️ `length ? : undefined` — lista vazia NUNCA sai daqui: ela faria a
        // tela desenhar barra em zero em toda matéria. Ver o docblock do DTO.
        aproveitamentoPorMateria: aproveitamento?.materias?.length
          ? enxugarMaterias(aproveitamento.materias)
          : undefined,
        falha: descreverFalha(h.falha),
      },
    ];
  }

  async consultarQuestoes(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
    usuarios?: string[];
  }): Promise<QuestoesDoRelatorioDtoOutput> {
    const [agregados, numeros] = await Promise.all([
      this.repository.agregarPorQuestao(params),
      this.simuladoRepository.getNumerosDasQuestoes(params.simuladoId),
    ]);

    const numeroPorQuestao = new Map(
      numeros.map((n) => [n.questaoId, n.numero]),
    );

    const questoes: QuestaoDoRelatorioDtoOutput[] = agregados.map((a) => ({
      numero: numeroPorQuestao.get(a.questaoId) ?? null,
      questaoId: a.questaoId,
      respondentes: a.respondentes,
      acertos: a.acertos,
      erros: a.erros,
      semLeitura: a.semLeitura,
      porAlternativa: a.porAlternativa,
      alternativaCorreta: a.alternativaCorreta,
    }));

    // Questão sem número vai para o fim: sumir da ordenação seria pior que
    // aparecer fora de ordem, porque o professor não saberia que ela existe.
    // Dois nulos empatam (0) — devolver 1 nos dois sentidos não é uma ordem
    // total, e a ordem relativa entre elas ficaria indefinida.
    questoes.sort((a, b) => {
      if (a.numero === null && b.numero === null) return 0;
      if (a.numero === null) return 1;
      if (b.numero === null) return -1;
      return a.numero - b.numero;
    });

    return { questoes };
  }

  /**
   * O que UM estudante marcou, questão a questão, já classificado.
   *
   * ⚠️ Quem classifica é o ms, não a tela: a regra de "sem leitura" é a
   * AUSÊNCIA da chave `alternativaEstudante`, sutil o bastante para duas
   * implementações dela divergirem. Mesmo motivo pelo qual o card 01 derivou a
   * descrição da falha no servidor.
   *
   * ⚠️ `falha` E `respostas` são o mesmo tipo de campo VELHO, e por isso os
   * dois são filtrados pelo `status`: cada um tem um único escritor
   * (`marcarFalha` e `completeProcessing`) e ninguém nunca os desfaz —
   * `marcarFalha` e `prepararParaProcessamento` não tocam nas `respostas`,
   * `completeProcessing` não toca na `falha`. Um cartão que completou,
   * reprocessou e falhou carrega as duas coisas da rodada anterior. O
   * `agregarPorQuestao` já filtra `Completed` pelo mesmo motivo; aqui o filtro
   * é campo a campo porque o estado atual (`status`) é justamente o que a tela
   * precisa ver.
   */
  async consultarDetalhe(params: {
    simuladoId: string;
    cursinhoId: string;
    usuario: string;
  }): Promise<DetalheDoEstudanteDtoOutput> {
    const linha = await this.repository.buscarDetalheDoEstudante(params);

    // ⚠️ 404, não lista vazia: a tela pediu UM estudante. Vazio diria "ele não
    // respondeu nada", que é outra coisa. E a linha órfã (histórico apagado
    // depois do vínculo) cai aqui pelo mesmo motivo.
    if (!linha?.historico) {
      throw new NotFoundException(
        `estudante ${params.usuario} não tem cartão neste simulado`,
      );
    }

    const h = linha.historico;
    const numeros = await this.simuladoRepository.getNumerosDasQuestoes(
      params.simuladoId,
    );
    const numeroPorQuestao = new Map(
      numeros.map((n) => [n.questaoId, n.numero]),
    );

    // ⚠️ Só em `completed`. Em qualquer outro status as `respostas` gravadas
    // são as da tentativa ANTERIOR (ver o docblock): devolvê-las afirmaria que
    // a leitura de agora produziu o que ela não produziu. Lista vazia: o join
    // do `numero` e a ordenação abaixo simplesmente não têm o que fazer.
    const respostasDaLeituraAtual =
      h.status === HistoricoStatus.Completed ? h.respostas ?? [] : [];

    const respostas = respostasDaLeituraAtual.map((r: any) => {
      const questaoId = r.questao?.toString();
      // ⚠️ AUSÊNCIA da chave. Trocar por `=== null` ou `=== ''` faz a questão
      // não marcada virar ERRO — e o professor revisa a aula errada.
      const marcada = r.alternativaEstudante;
      const resultado =
        marcada === undefined
          ? ResultadoDaQuestao.SemLeitura
          : marcada === r.alternativaCorreta
            ? ResultadoDaQuestao.Acerto
            : ResultadoDaQuestao.Erro;

      return {
        numero: numeroPorQuestao.get(questaoId) ?? null,
        questaoId,
        alternativaEstudante: marcada,
        alternativaCorreta: r.alternativaCorreta,
        resultado,
      };
    });

    // Questão sem número vai para o fim — sumir seria pior que aparecer fora
    // de ordem. Dois nulos empatam (0): devolver 1 nos dois sentidos não é uma
    // ordem total. Mesma regra do `consultarQuestoes`.
    respostas.sort((a, b) => {
      if (a.numero === null && b.numero === null) return 0;
      if (a.numero === null) return 1;
      if (b.numero === null) return -1;
      return a.numero - b.numero;
    });

    return {
      status: h.status,
      // ⚠️ Só em `failed`: `marcarFalha` é o único escritor de `falha` e nada
      // nunca a desfaz (o `completeProcessing` não toca nela), então um cartão
      // reprocessado carrega o motivo antigo. Mesma armadilha que o card 06
      // fechou na tela — e a mesma que o gate das `respostas` acima fecha.
      falha:
        h.status === HistoricoStatus.Failed
          ? descreverFalha(h.falha)
          : undefined,
      respostas,
    };
  }

  async listarSimulados(params: {
    cursinhoId: string;
    turmaId?: string;
    usuarios?: string[];
  }): Promise<SimuladosComCartaoDtoOutput> {
    const agregado = await this.repository.listarSimuladosComCartao(params);
    if (agregado.length === 0) return { simulados: [] };

    const nomes = await this.simuladoRepository.getNomesPorIds(
      agregado.map((a) => a.simuladoId),
    );
    const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));

    // A ordem vem do repositório (ultimoEnvio desc) e é preservada: o `map`
    // não reordena, e não há `sort` aqui de propósito.
    return {
      simulados: agregado.map((a) => ({
        simuladoId: a.simuladoId,
        // `?? null`: simulado apagado depois do vínculo não some da lista —
        // os cartões existem e escondê-los é pior que rotulá-los.
        nome: nomePorId.get(a.simuladoId) ?? null,
        cartoes: a.cartoes,
        comLeituraConcluida: a.comLeituraConcluida,
        ultimoEnvio: a.ultimoEnvio,
      })),
    };
  }
}
