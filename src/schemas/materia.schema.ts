import * as mongoose from 'mongoose';

export const MateriaSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: false,
  versionKey: false
});
