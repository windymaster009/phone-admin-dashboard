import mongoose from 'mongoose'

const { Schema, model } = mongoose

const receiptSchema = new Schema(
  {
    receiptNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    documentType: {
      type: String,
      enum: [
        'SALE_RECEIPT',
        'PURCHASE_RECEIPT',
        'REFUND_RECEIPT',
        'PAWN_CONTRACT',
        'PAWN_PAYMENT',
        'PAWN_REDEMPTION',
        'LOAN_AGREEMENT',
        'LOAN_PAYMENT',
        'SERVICE_RECEIPT',
      ],
      required: true,
      index: true,
    },
    sourceType: { type: String, enum: ['TRADE', 'PAWN', 'LOAN', 'SERVICE'], required: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    sourceSubId: { type: String, required: true, default: 'primary' },
    referenceNo: { type: String, required: true, uppercase: true, trim: true, index: true },
    partyName: { type: String, trim: true, index: true },
    partyPhone: { type: String, trim: true, index: true },
    currency: { type: String, enum: ['USD', 'KHR'], default: 'USD', index: true },
    total: { type: Number, min: 0, default: 0 },
    issuedAt: { type: Date, required: true, default: Date.now, index: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    printCount: { type: Number, min: 0, default: 0 },
    firstPrintedAt: Date,
    lastPrintedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastPrintedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
)

receiptSchema.index(
  { sourceType: 1, sourceId: 1, documentType: 1, sourceSubId: 1 },
  { unique: true, name: 'unique_source_document_receipt' },
)
receiptSchema.index({ issuedAt: -1, createdAt: -1 })

export const Receipt = model('Receipt', receiptSchema)
