import mongoose from 'mongoose'

const { Schema, model } = mongoose
const baseOptions = { timestamps: true, versionKey: false }

const borrowerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    nationalIdNumber: { type: String, trim: true, index: true },
    address: { type: String, trim: true },
  },
  { _id: false, versionKey: false },
)

const loanSchema = new Schema(
  {
    loanNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    borrower: { type: borrowerSchema, required: true },
    principal: { type: Number, min: 0.01, required: true },
    interestType: {
      type: String,
      enum: ['NONE', 'FIXED', 'PERCENT'],
      default: 'NONE',
    },
    interestValue: { type: Number, min: 0, default: 0 },
    interestAmount: { type: Number, min: 0, default: 0 },
    totalDue: { type: Number, min: 0.01, required: true },
    amountPaid: { type: Number, min: 0, default: 0 },
    remainingBalance: { type: Number, min: 0, required: true },
    currency: { type: String, enum: ['USD', 'KHR'], default: 'USD', index: true },
    loanDate: { type: Date, required: true, default: Date.now, index: true },
    dueDate: { type: Date, required: true, index: true },
    reminderDays: { type: Number, min: 0, max: 30, default: 3 },
    status: {
      type: String,
      enum: ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    reason: { type: String, trim: true },
    notes: { type: String, trim: true },
    paidAt: Date,
    cancelledAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

loanSchema.index({ status: 1, dueDate: 1 })
loanSchema.index({ 'borrower.name': 1, 'borrower.phone': 1 })

const loanPaymentSchema = new Schema(
  {
    paymentNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    loan: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
    amount: { type: Number, min: 0.01, required: true },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'],
      default: 'CASH',
    },
    paidAt: { type: Date, required: true, default: Date.now, index: true },
    reference: { type: String, trim: true },
    note: { type: String, trim: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseOptions,
)

loanPaymentSchema.index({ loan: 1, paidAt: -1 })

export const Loan = model('Loan', loanSchema)
export const LoanPayment = model('LoanPayment', loanPaymentSchema)
