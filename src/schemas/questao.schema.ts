import * as mongoose from 'mongoose';
import { Alternativa } from 'src/enums/alternativa.enum';
import { Caderno } from 'src/enums/caderno.enum';
import { EnemArea } from 'src/enums/enem-area.enum';

export const QuestaoSchema = new mongoose.Schema({
  exame: {
    type: mongoose.Schema.Types.ObjectId,
    require: true,
    ref: 'Exame'
  },
  ano: {
    type: Number,
    require: true
  },
  caderno: {
    type: String,
    enum: Caderno,
    require: true
  },
  enemArea: {
    type: String,
    enum: EnemArea,
    require: true
  },
  frente1: {
    type: mongoose.Schema.Types.ObjectId,
    require: true,
    ref: 'Frente'
  },
  frente2: {
    type: mongoose.Schema.Types.ObjectId,
    require: false,
    ref: 'Frente'
  },
  frente3: {
    type: mongoose.Schema.Types.ObjectId,
    require: false,
    ref: 'Frente'
  },
  materia: {
    type: mongoose.Schema.Types.ObjectId,
    require: false,
    ref: 'Materia'
  },
  numero: {
    type: Number,
    require: true
  },
  textoQuestao: {
    type: String,
    required: true
  },
  textoAlternativaA: {
    type: String,
    required: true
  },
  textoAlternativaB: {
    type: String,
    required: true
  },
  textoAlternativaC: {
    type: String,
    required: true
  },
  textoAlternativaD: {
    type: String,
    required: true
  },
  textoAlternativaE: {
    type: String,
    required: true
  },
  alternativa: {
    type: String,
    enum: Alternativa,
    required: true,
    select: false
  },
  imageId: {
    type: String,
    required: true
  },
  acertos: {
    type: Number,
    required: false,
    default: 0,
    select: false
  },
  quantidadeSimulado: {
    type: Number,
    required: false,
    default: 0,
    select: false
  },
  quantidadeResposta: {
    type: Number,
    required: false,
    default: 0
  }
}, {
  timestamps: true,
  versionKey: false
});
