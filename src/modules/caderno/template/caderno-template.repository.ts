import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { CadernoTemplate } from './caderno-template.schema';

/** O que o serviço entrega para virar um rascunho. */
export type DadosRascunho = Partial<CadernoTemplate>;

/**
 * A resposta, não só a proibição: quem esbarrar num caminho de escrita
 * herdado precisa sair daqui sabendo o que usar no lugar.
 */
const SO_OS_METODOS_COM_STATUS =
  'Versão publicada é imutável nesta coleção: use criarRascunho, ' +
  'substituirRascunho, descartarRascunho, arquivarPublicada ou ' +
  'promoverRascunho — são os únicos caminhos de escrita, e cada um carrega o ' +
  'status esperado no filtro.';

@Injectable()
export class CadernoTemplateRepository extends BaseRepository<CadernoTemplate> {
  constructor(
    @InjectModel(CadernoTemplate.name) model: Model<CadernoTemplate>,
  ) {
    super(model);
  }

  // ---------------------------------------------------------------- consultas

  async publicada(): Promise<CadernoTemplate> {
    return await this.model.findOne({ status: 'publicada' }).exec();
  }

  async rascunho(): Promise<CadernoTemplate> {
    return await this.model.findOne({ status: 'rascunho' }).exec();
  }

  /**
   * ⚠️ DECRESCENTE: a tela mostra a mais nova em cima. Ascendente é a ordem
   * natural do índice e passaria despercebido numa lista de duas linhas.
   */
  async versoes(): Promise<CadernoTemplate[]> {
    return await this.model.find().sort({ versao: -1 }).exec();
  }

  /** Para o restaurar — evita varrer `versoes()` no array. */
  async porVersao(versao: number): Promise<CadernoTemplate> {
    return await this.model.findOne({ versao }).exec();
  }

  /**
   * ⚠️ Olha TODOS os status. Filtrar por 'publicada' aqui reaproveitaria o
   * número de uma versão arquivada e explodiria no índice único de `versao`,
   * em produção, no meio de um publicar.
   *
   * `0` (e não `null`) quando vazio: quem chama faz `max + 1`, e assim a
   * primeira versão é 1 por decisão, não por acidente do JS.
   */
  async maiorVersao(): Promise<number> {
    const maior = await this.model.findOne({}).sort({ versao: -1 }).exec();
    return maior ? maior.versao : 0;
  }

  // ----------------------------------------------------------------- escritas
  // ⚠️ Todo filtro de escrita carrega o status esperado. Nunca `{ _id }`
  // sozinho: um `_id` não diz em que estado o documento está, e é assim que
  // uma `publicada` acaba alterada.

  async criarRascunho(
    dados: DadosRascunho,
    session?: ClientSession,
  ): Promise<CadernoTemplate> {
    const [criado] = await this.model.create(
      [{ ...dados, status: 'rascunho' }],
      { session },
    );
    return criado.toObject() as CadernoTemplate;
  }

  /** Último upload vence: descarta o rascunho corrente e põe outro no lugar. */
  async substituirRascunho(
    dados: DadosRascunho,
    session?: ClientSession,
  ): Promise<CadernoTemplate> {
    await this.descartarRascunho(session);
    return await this.criarRascunho(dados, session);
  }

  async descartarRascunho(session?: ClientSession) {
    return await this.model
      .deleteOne({ status: 'rascunho' }, { session })
      .exec();
  }

  async arquivarPublicada(session?: ClientSession) {
    return await this.model
      .updateOne(
        { status: 'publicada' },
        { $set: { status: 'arquivada' } },
        { session },
      )
      .exec();
  }

  async promoverRascunho(versao: number, session?: ClientSession) {
    return await this.model
      .updateOne(
        { status: 'rascunho' },
        { $set: { status: 'publicada', versao, publicadaEm: new Date() } },
        { session },
      )
      .exec();
  }

  // --------------------------------------------- o que esta classe PROÍBE
  /**
   * ⚠️ `BaseRepository` traz três caminhos de escrita que ignoram o status, e
   * o critério do card ("não há caminho de escrita que altere uma publicada")
   * é sobre a SUPERFÍCIE DESTA CLASSE, não sobre quem chama: se a garantia
   * depender de o serviço se comportar bem, ela deixa de ser propriedade do
   * repositório e vira convenção. Medido em `src/shared/base/base.repository.ts`:
   *
   * - `update(entity)` (l.58) filtra por `{ _id: entity._id }` — um `_id` não
   *   diz em que estado o documento está, e alteraria uma `publicada`.
   * - `delete(id)` (l.47) faz `findOneAndUpdate({ _id: id }, { deleted: true })`
   *   em documento de QUALQUER estado, `publicada` incluída.
   * - `create(item)` (l.14) é agnóstico de estado: deixaria inserir uma
   *   SEGUNDA `publicada`, porque o índice parcial só restringe `rascunho`.
   *   É o menos óbvio dos três — nada no schema proíbe duas publicadas.
   *
   * A catraca do spec não pega nenhum deles: `Object.getOwnPropertyNames` não
   * enumera membro herdado. Alargar o regex dela também não resolveria —
   * detectar não é impedir. Por isso os três lançam.
   *
   * Nenhum dos cinco métodos acima passa por aqui: todos vão direto ao
   * `this.model`.
   */
  create(): Promise<CadernoTemplate> {
    throw new Error(SO_OS_METODOS_COM_STATUS);
  }

  update(): Promise<void> {
    throw new Error(SO_OS_METODOS_COM_STATUS);
  }

  delete(): Promise<void> {
    throw new Error(SO_OS_METODOS_COM_STATUS);
  }
}
