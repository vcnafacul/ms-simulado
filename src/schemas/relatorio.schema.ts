import * as mongoose from 'mongoose';
import { Alternativa } from 'src/enums/alternativa.enum';

export const RelatorioSchema = new mongoose.Schema({
  estudante: {
    type: Number,
    require: true
  },
  simulado: {
    type: mongoose.Schema.Types.ObjectId,
    require: true,
    ref: 'Simulado'
  },
  respostas: [{
    questao: {
      type: mongoose.Schema.Types.ObjectId,
      require: true,
      ref: 'Questao'
    },
    respostaEstudante: {
      type: String,
      enum: Alternativa,
      required: true
    },
    alternativaCorreta: {
      type: String,
      enum: Alternativa,
      required: true
    },
    _id : false
  }],
  aproveitamento: {
    type: Number,
    require: false,
    default: 0
  }
},{
  timestamps: true,
  versionKey: false
});
