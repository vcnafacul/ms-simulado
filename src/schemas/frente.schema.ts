import * as mongoose from 'mongoose';

export const FrenteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: false,
  versionKey: false
});
