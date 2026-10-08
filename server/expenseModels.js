import mongoose from 'mongoose'

const { Schema, model } = mongoose

const expenseSchema = new Schema({
  expenseNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120, index: true },
  category: {
    type: String,
    enum: ['RENT', 'UTILITIES', 'SALARY', 'TRANSPORT', 'REPAIR', 'SUPPLIES', 'MARKETING', 'TAX', 'OTHER'],
    required: true,
    index: true,
  },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, enum: ['USD', 'KHR'], required: true, index: true },
  exchangeRate: { type: Number, required: true, min: 1 },
  paymentMethod: { type: String, enum: ['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'], required: true, index: true },
  expenseDate: { type: Date, required: true, index: true },
  payee: { type: String, trim: true, maxlength: 120 },
  reference: { type: String, trim: true, maxlength: 100 },
  notes: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['RECORDED', 'VOIDED'], default: 'RECORDED', required: true, index: true },
  idempotencyKey: { type: String, trim: true, sparse: true, unique: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  voidedAt: Date,
  voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  voidReason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false })

expenseSchema.index({ expenseDate: -1, createdAt: -1 })

export const Expense = model('Expense', expenseSchema)
