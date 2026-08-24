import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const customerDocumentCategories = [
  'NATIONAL_ID_FRONT',
  'NATIONAL_ID_BACK',
  'CUSTOMER_PHOTO',
  'PAWN_ITEM_PHOTO',
  'SIGNED_AGREEMENT',
  'PURCHASE_EVIDENCE',
  'OTHER',
]

const customerDocumentSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    category: { type: String, enum: customerDocumentCategories, required: true, index: true },
    relatedType: { type: String, enum: ['CUSTOMER', 'PAWN', 'TRADE'], default: 'CUSTOMER', index: true },
    relatedId: { type: Schema.Types.ObjectId, index: true },
    relatedReference: { type: String, trim: true, maxlength: 120, index: true },
    originalName: { type: String, required: true, trim: true, maxlength: 120 },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], required: true },
    byteSize: { type: Number, min: 1, required: true },
    sha256: { type: String, required: true, lowercase: true, trim: true },
    keyId: { type: String, required: true, trim: true },
    encryptionVersion: { type: Number, default: 1, required: true },
    encryptedData: { type: Buffer, required: true, select: false },
    iv: { type: Buffer, required: true, select: false },
    authTag: { type: Buffer, required: true, select: false },
    note: { type: String, trim: true, maxlength: 500 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
)

customerDocumentSchema.index({ customer: 1, createdAt: -1 })
customerDocumentSchema.index({ relatedType: 1, relatedId: 1, createdAt: -1 })
customerDocumentSchema.index({ customer: 1, category: 1, createdAt: -1 })
customerDocumentSchema.index({ customer: 1, category: 1, sha256: 1 }, { unique: true })

const documentStorageUsageSchema = new Schema(
  {
    scope: { type: String, enum: ['SHOP'], default: 'SHOP', unique: true, required: true },
    encryptedBytes: { type: Number, min: 0, default: 0, required: true },
    documentCount: { type: Number, min: 0, default: 0, required: true },
  },
  { timestamps: true, versionKey: false },
)

export const CustomerDocument = model('CustomerDocument', customerDocumentSchema)
export const DocumentStorageUsage = model('DocumentStorageUsage', documentStorageUsageSchema)
