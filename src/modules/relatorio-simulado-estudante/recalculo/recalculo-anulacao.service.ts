import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EnvService } from 'src/shared/modules/env/env.service';
import { QueueProducer } from 'src/shared/modules/queue/queue.producer';
import { HistoricoRepository } from '../../historico/historico.repository';
import {
  recalcularHistorico,
  SlotParaRecalculo,
} from '../../historico/recalculo/recalcularHistorico';
import { listaDeAnulados } from '../../simulado/anuladas';
import { RelatorioSimuladoEstudanteRepository } from '../relatorio-simulado-estudante.repository';
import { AvisoDoRecalculoService } from './aviso-do-recalculo.service';
import { DivergenciaRepository } from './divergencia.repository';
import {
  AfetadoDoRecalculo,
  chaveDoRecorte,
  RecalculoAnulacao,
  STATUS_ATIVOS,
  StatusDoRecalculo,
} from './recalculo-anulacao.schema';

export const STREAM_RECALCULO = 'stream:simulado:recalculo-anulacao';
export const TAMANHO_DO_LOTE = 50;
export const PASSADAS_MAX = 5;

export interface Recorte {
  simuladoIds: string[];
  cursinhoId: string;
  provaId?: string | null;
}

export interface AnulacaoDoRecorte {
  numero: number;
  motivo: string;
  justificativa: string;
}

export interface SituacaoDoRecorte {
  divergentes: number;
  /** As anuladas AGORA nos simulados do recorte — o texto do aviso. */
  anulacoes: AnulacaoDoRecorte[];
}

/** `YYYY-MM` em São Paulo: o mês em que o aluno fez a prova, para o agregado da turma. */
export function mesDe(data?: Date | null): string {
  const d = data ? new Date(data) : new Date();
  const [{ value: ano }, , { value: mes }] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  return `${ano}-${mes}`;
}

/**
 * Divergência e recálculo em fila (tickets/042, card 12).
 *
 * ⚠️ **Anular nunca dispara nada** (D6): o job só nasce aqui, pedido no
 * relatório, e só se houver divergente.
 * ⚠️ **R4:** respostas e gabarito gravados (sem OMR), sem
 * `updateQuestionAnswered` (D9) e **sem push por histórico** — o aviso à api
 * sai uma vez, no fim do job.
 */
@Injectable()
export class RecalculoAnulacaoService {
  private readonly logger = new Logger(RecalculoAnulacaoService.name);
  /** Um job por vez neste processo: a fila em memória entrega em paralelo. */
  private corrente: Promise<void> = Promise.resolve();

  constructor(
    @InjectModel(RecalculoAnulacao.name)
    private readonly jobs: Model<RecalculoAnulacao>,
    private readonly divergencia: DivergenciaRepository,
    private readonly historicos: HistoricoRepository,
    private readonly relatorio: RelatorioSimuladoEstudanteRepository,
    private readonly producer: QueueProducer,
    private readonly aviso: AvisoDoRecalculoService,
    private readonly env: EnvService,
  ) {}

  pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async recorteDaProva(provaId: string, cursinhoId: string): Promise<Recorte> {
    const prova = await this.relatorio.buscarProva(provaId);
    if (!prova) throw new NotFoundException(`prova ${provaId} não encontrada`);
    return { simuladoIds: prova.simuladoIds, cursinhoId, provaId };
  }

  /** Só consulta, indexada (R3). Base do aviso do relatório (card 13/15). */
  async situacao(recorte: Recorte): Promise<SituacaoDoRecorte> {
    const estado = await this.divergencia.estadoDosSimulados(
      recorte.simuladoIds,
    );
    let divergentes = 0;
    const anulacoes = new Map<number, AnulacaoDoRecorte>();
    for (const s of estado) {
      divergentes += await this.divergencia.contar(
        String(s._id),
        recorte.cursinhoId,
        s.revisaoAnulacao ?? 0,
      );
      for (const qc of s.questoes ?? []) {
        if (qc.anulacao && qc.numero != null && !anulacoes.has(qc.numero)) {
          anulacoes.set(qc.numero, {
            numero: qc.numero,
            motivo: qc.anulacao.motivo,
            justificativa: qc.anulacao.justificativa,
          });
        }
      }
    }
    return {
      divergentes,
      anulacoes: [...anulacoes.values()].sort((a, b) => a.numero - b.numero),
    };
  }

  async consultar(recorte: Recorte) {
    const chave = chaveDoRecorte(recorte.cursinhoId, recorte.simuladoIds);
    const [situacao, jobAtivo, ultimoJob] = await Promise.all([
      this.situacao(recorte),
      this.jobs.findOne({ chave, ativo: true }).lean().exec(),
      this.jobs
        .findOne({ chave, status: { $nin: STATUS_ATIVOS } })
        .sort({ criadoEm: -1 })
        .lean()
        .exec(),
    ]);
    return {
      ...situacao,
      jobAtivo: resumo(jobAtivo),
      ultimoJob: resumo(ultimoJob),
    };
  }

  /**
   * Pede o recálculo do recorte. Sem divergente → nada a recalcular. Já há um
   * ativo → devolve o ativo (R6), inclusive na corrida de dois pedidos juntos.
   */
  async solicitar(recorte: Recorte, solicitadoPor?: string) {
    const chave = chaveDoRecorte(recorte.cursinhoId, recorte.simuladoIds);
    const ativo = await this.jobs.findOne({ chave, ativo: true }).lean().exec();
    if (ativo) return { criado: false, job: resumo(ativo) };

    const { divergentes } = await this.situacao(recorte);
    if (!divergentes) {
      return {
        criado: false,
        job: resumo(null),
        mensagem: 'Nada a recalcular.',
      };
    }
    let job: RecalculoAnulacao;
    try {
      job = await this.jobs.create({
        simuladoIds: recorte.simuladoIds,
        provaId: recorte.provaId ?? null,
        cursinhoId: recorte.cursinhoId,
        chave,
        ativo: true,
        status: StatusDoRecalculo.naFila,
        total: divergentes,
        solicitadoPor,
        criadoEm: new Date(),
      });
    } catch (e) {
      // O índice único parcial pegou a corrida: outro pedido criou primeiro.
      if ((e as { code?: number }).code === 11000) {
        const outro = await this.jobs
          .findOne({ chave, ativo: true })
          .lean()
          .exec();
        return { criado: false, job: resumo(outro) };
      }
      throw e;
    }
    await this.producer.publish(STREAM_RECALCULO, { jobId: String(job._id) });
    return { criado: true, job: resumo(job) };
  }

  /** Serializa: um job por vez. */
  enfileirar(jobId: string): Promise<void> {
    this.corrente = this.corrente
      .then(() => this.processar(jobId))
      .catch((err) => this.logger.error(`recálculo ${jobId} falhou`, err));
    return this.corrente;
  }

  /** Boot (R5): retoma os ativos e reenvia o aviso que não chegou. */
  async retomar(): Promise<void> {
    const pendentes = await this.jobs
      .find(
        {
          $or: [
            { ativo: true },
            {
              status: StatusDoRecalculo.concluido,
              avisadoEm: null,
              'afetados.0': { $exists: true },
            },
          ],
        },
        { _id: 1, ativo: 1 },
      )
      .lean()
      .exec();
    for (const j of pendentes) {
      if (j.ativo)
        await this.producer.publish(STREAM_RECALCULO, { jobId: String(j._id) });
      else await this.avisarFim(String(j._id));
    }
  }

  async processar(jobId: string): Promise<void> {
    const job = await this.jobs
      .findOneAndUpdate(
        { _id: new Types.ObjectId(jobId), ativo: true },
        [
          {
            $set: {
              status: StatusDoRecalculo.processando,
              iniciadoEm: { $ifNull: ['$iniciadoEm', '$$NOW'] },
            },
          },
        ],
        { new: true },
      )
      .lean()
      .exec();
    if (!job) return;

    const pausaMs = Number(this.env.get('RECALCULO_PAUSA_MS') ?? 200);
    const inicio = Date.now();
    try {
      let passadas = job.passadas ?? 0;
      const falhas = new Set<string>(job.falhasIds ?? []);
      while (passadas < PASSADAS_MAX) {
        if (passadas > 0) {
          // Passada nova: soma ao denominador do progresso o que voltou a divergir.
          const { divergentes } = await this.situacao(job);
          await this.jobs
            .updateOne(
              { _id: job._id },
              { $inc: { total: Math.max(0, divergentes - falhas.size) } },
            )
            .exec();
        }
        const regravados = await this.passada(
          jobId,
          job.simuladoIds,
          job.cursinhoId,
          pausaMs,
          falhas,
        );
        passadas++;
        await this.jobs
          .updateOne({ _id: job._id }, { $set: { passadas } })
          .exec();
        const { divergentes } = await this.situacao(job);
        /*
          ⚠️ Anulação nova no meio deixa os já processados divergentes de novo:
          mais uma passada. O que falhou (não casa com o container) continua
          divergente, não é tentado de novo e não conta; e se a passada não
          regravou nada, repetir não muda o resultado.
        */
        if (divergentes - falhas.size <= 0 || !regravados) break;
      }
      const estado = await this.divergencia.estadoDosSimulados(job.simuladoIds);
      const numeros = new Set<number>();
      for (const s of estado)
        for (const qc of s.questoes ?? [])
          if (qc.anulacao && qc.numero != null) numeros.add(qc.numero);
      await this.jobs
        .updateOne(
          { _id: job._id },
          {
            $set: {
              status: StatusDoRecalculo.concluido,
              concluidoEm: new Date(),
              numerosAnulados: listaDeAnulados(numeros),
            },
            $unset: { ativo: '' },
          },
        )
        .exec();
      const fim = await this.jobs
        .findById(job._id, { processados: 1, falhas: 1 })
        .lean()
        .exec();
      this.logger.log(
        `recálculo ${jobId}: ${fim?.processados ?? 0} itens, ${fim?.falhas ?? 0} falhas, ` +
          `${passadas} passada(s), ${Math.round((Date.now() - inicio) / Math.max(1, fim?.processados ?? 1))} ms/item`,
      );
    } catch (err) {
      await this.jobs
        .updateOne(
          { _id: job._id },
          {
            $set: {
              status: StatusDoRecalculo.falhou,
              concluidoEm: new Date(),
              erro: String((err as Error)?.message ?? err),
            },
            $unset: { ativo: '' },
          },
        )
        .exec();
      throw err;
    }
    await this.avisarFim(jobId);
  }

  /** Uma passada pelo recorte. @returns quantos foram regravados. */
  private async passada(
    jobId: string,
    simuladoIds: string[],
    cursinhoId: string,
    pausaMs: number,
    falhasDoJob: Set<string>,
  ): Promise<number> {
    let regravados = 0;
    const estado = await this.divergencia.estadoDosSimulados(simuladoIds);
    for (const s of estado) {
      const simuladoId = String(s._id);
      // Cada item recalcula para a revisão ATUAL (R6), lida no começo do simulado.
      const alvo = s.revisaoAnulacao ?? 0;
      if (alvo <= 0) continue;
      const sim = await this.divergencia.simuladoParaRecalculo(simuladoId);
      const slots = (sim?.questoes ?? []) as unknown as SlotParaRecalculo[];
      let cursor: Types.ObjectId | null = null;
      for (;;) {
        const lote = await this.divergencia.lote(
          simuladoId,
          cursinhoId,
          alvo,
          cursor,
          TAMANHO_DO_LOTE,
        );
        if (!lote.length) break;
        const afetados: AfetadoDoRecalculo[] = [];
        const falhasNovas: string[] = [];
        let processados = 0;
        for (const h of lote) {
          if (falhasDoJob.has(String(h._id))) continue;
          processados++;
          const r = recalcularHistorico(h.respostas as never, slots, alvo);
          if (!r.ok) {
            falhasNovas.push(String(h._id));
            falhasDoJob.add(String(h._id));
            this.logger.warn(
              `recálculo ${jobId}: histórico ${h._id} — ${r.motivo}`,
            );
            continue;
          }
          // Condicional: um `processAnswer` no meio já gravou a revisão e vence.
          if (
            await this.historicos.regravarRecalculo(
              String(h._id),
              alvo,
              r.dados as never,
            )
          ) {
            afetados.push({
              usuario: h.usuario,
              historicoId: String(h._id),
              mes: mesDe(h.createdAt),
            });
          }
        }
        regravados += afetados.length;
        await this.jobs
          .updateOne(
            { _id: new Types.ObjectId(jobId) },
            {
              $inc: { processados, falhas: falhasNovas.length },
              $push: {
                afetados: { $each: afetados },
                falhasIds: { $each: falhasNovas },
              },
            },
          )
          .exec();
        cursor = lote[lote.length - 1]._id;
        if (pausaMs > 0) await this.pausa(pausaMs);
      }
    }
    return regravados;
  }

  private async avisarFim(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId).lean().exec();
    if (
      !job ||
      job.status !== StatusDoRecalculo.concluido ||
      !job.afetados?.length
    )
      return;
    const nome =
      (job.provaId && (await this.relatorio.buscarProva(job.provaId))?.nome) ||
      (await this.divergencia.estadoDosSimulados(job.simuladoIds))[0]?.nome ||
      'Simulado';
    // Um histórico por aluno pode aparecer em duas passadas: o primeiro basta.
    const vistos = new Set<string>();
    const afetados = job.afetados.filter(
      (a) => !vistos.has(a.historicoId) && vistos.add(a.historicoId),
    );
    const ok = await this.aviso.avisar({
      jobId,
      provaNome: nome.slice(0, 200),
      simuladoIds: job.simuladoIds,
      numerosAnulados: job.numerosAnulados ?? [],
      afetados,
    });
    if (ok)
      await this.jobs
        .updateOne({ _id: job._id }, { $set: { avisadoEm: new Date() } })
        .exec();
  }
}

function resumo(job: (Partial<RecalculoAnulacao> & { _id?: unknown }) | null) {
  if (!job) return null;
  return {
    id: String(job._id),
    status: job.status,
    total: job.total ?? 0,
    processados: job.processados ?? 0,
    falhas: job.falhas ?? 0,
    regravados: job.afetados?.length ?? 0,
    criadoEm: job.criadoEm,
    concluidoEm: job.concluidoEm ?? null,
  };
}
