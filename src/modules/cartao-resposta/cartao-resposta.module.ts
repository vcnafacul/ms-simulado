import { Module } from '@nestjs/common';
import { CartaoRespostaService } from './cartao-resposta.service';

@Module({
  providers: [CartaoRespostaService],
  exports: [CartaoRespostaService],
})
export class CartaoRespostaModule {}
