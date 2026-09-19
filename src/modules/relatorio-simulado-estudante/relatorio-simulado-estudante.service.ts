import { Injectable, Logger } from '@nestjs/common';
import { descreverFalha } from '../historico/falha/mapa-falha';
import { SimuladoRepository } from '../simulado/simulado.repository';
import {
  LinhaRelatorioDtoOutput,
  RelatorioSimuladoDtoOutput,
} from './dtos/relatorio-simulado.dto.output';
import {
  QuestaoDoRelatorioDtoOutput,
  QuestoesDoRelatorioDtoOutput,
} from './dtos/questoes-do-relatorio.dto.output';
import { SimuladosComCartaoDtoOutput } from './dtos/simulados-com-cartao.dto.output';
import {
  LinhaComHistorico,
  RelatorioSimuladoEstudanteRepository,
} from './relatorio-simulado-estudante.repository';

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

    return [
      {
        usuario: l.usuario,
        turmaId: l.turmaId,
        historicoId: h._id.toString(),
        status: h.status,
        cartaoCode: h.cartaoCode,
        questoesRespondidas: h.questoesRespondidas,
        // ausente, não zero — ver o docblock do DTO
        aproveitamentoGeral: h.aproveitamento?.geral,
        falha: descreverFalha(h.falha),
      },
    ];
  }

  async consultarQuestoes(params: {
    simuladoId: string;
    cursinhoId: string;
    turmaId?: string;
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

  async listarSimulados(params: {
    cursinhoId: string;
    turmaId?: string;
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
