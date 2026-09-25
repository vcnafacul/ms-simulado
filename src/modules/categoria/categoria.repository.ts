import { BaseRepository } from 'src/shared/base/base.repository';
import { Categoria } from './schemas/categoria.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { GetAllWhereInput } from 'src/shared/base/interfaces/get-all.input';
import { GetAllOutput } from 'src/shared/base/interfaces/get-all.output';

export class CategoriaRepository extends BaseRepository<Categoria> {
  constructor(@InjectModel(Categoria.name) model: Model<Categoria>) {
    super(model);
  }

  /**
   * ⚠️ **Exclusão DEFINITIVA** (QA) — sobrepõe o soft delete do base. Com o
   * soft delete, a excluída seguia no banco e o cursinho não conseguia recriar
   * uma categoria de mesmo nome sempre que algum índice ou consulta esquecesse
   * de ignorar `deleted`. Quem garante que nada aponta para ela é o
   * `CategoriaService.delete`, que confere provas e simulados antes.
   */
  override async delete(id: string): Promise<void> {
    const { deletedCount } = await this.model.deleteOne({ _id: id });
    if (deletedCount === 0) {
      throw new NotFoundException(`Registro com ID ${id} não encontrado.`);
    }
  }

  /**
   * A categoria VIVA com esse nome, para esse dono.
   *
   * ⚠️ `deleted: { $ne: true }` não é detalhe: `getByFilter` do base não filtra
   * soft delete, então sem isso o service devolve 409 apontando para um
   * registro que o usuário não enxerga mais — e o índice parcial (que ignora os
   * excluídos) permitiria a criação. Service e índice discordariam.
   */
  async getAtivaByNomeEDono(nome: string, dono: string): Promise<Categoria> {
    return await this.model.findOne({ nome, dono, deleted: { $ne: true } });
  }

  override async getById(id: string): Promise<Categoria> {
    return await this.model.findById(id).populate('exame');
  }

  override async getAll({
    page,
    limit,
    where,
  }: GetAllWhereInput): Promise<GetAllOutput<Categoria>> {
    // guard por último: caller não pode sobrescrever o filtro de soft-delete
    const filter = { ...where, deleted: { $ne: true } };
    const data = await this.model
      .find()
      .skip((page - 1) * limit)
      .limit(limit ?? Infinity)
      .where(filter)
      .populate('exame');
    const totalItems = await this.model.where(filter).countDocuments();
    return { data, page, limit, totalItems };
  }
}
