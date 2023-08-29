import * as mongoose from 'mongoose';

export const SimuladoSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true
  },
  descricao: {
    type: String,
    required: true
  },
  tipo: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    ref: 'TipoSimulado'
  },
  questoes: [{
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    ref: 'Questao'
  }],
  aproveitamento: {
    type: Number,
    required: false,
    default: 0
  },
  vezesRespondido: {
    type: Number,
    required: false,
    default: 0
  },
  bloqueado: {
    type: Boolean,
    required: false,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});
