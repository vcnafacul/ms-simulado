import * as mongoose from 'mongoose';

export const TipoSimuladoSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    unique: true
  },
  quantidadeTotalQuestao: {
    type: Number,
    required: true
  },
  duracao: {
    type: Number,
    required: true,
  },
  regras: [{
    materia: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Materia'
    },
    quantidade: {
      type: Number,
      required: true
    },
    frente: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'Frente'
    },
    ano: {
      type: Number,
      required: false
    },
    caderno: {
      type: Number,
      required: false
    },
    _id: false
  }]
}, {
  timestamps: true,
  versionKey: false
});
