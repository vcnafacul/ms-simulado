import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CartaoExcluido } from './cartao-excluido.schema';

@Injectable()
export class CartaoExcluidoRepository {
  constructor(
    @InjectModel(CartaoExcluido.name)
    private readonly model: Model<CartaoExcluido>,
  ) {}

  async registrar(registro: CartaoExcluido): Promise<void> {
    await this.model.create(registro);
  }
}
