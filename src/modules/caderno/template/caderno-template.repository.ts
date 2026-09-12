import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { BaseRepository } from 'src/shared/base/base.repository';
import { CadernoTemplate } from './caderno-template.schema';

/** O que o serviço entrega para virar um rascunho. */
export type DadosRascunho = Partial<CadernoTemplate>;

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
}
