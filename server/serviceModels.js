import mongoose from 'mongoose'

const { Schema, model } = mongoose
const baseOptions = { timestamps: true, versionKey: false }

const serviceOfferingSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ['ACCOUNT_SETUP', 'DEVICE_SETUP', 'DATA_TRANSFER', 'SOFTWARE', 'OTHER'],
      required: true,
      index: true,
    },
    description: { type: String, trim: true },
    currency: { type: String, enum: ['USD', 'KHR'], default: 'USD' },
    price: { type: Number, min: 0, default: 0 },
    priceUsd: { type: Number, min: 0 },
    priceKhr: { type: Number, min: 0 },
    pricingExchangeRate: { type: Number, min: 0 },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

const serviceChargeSchema = new Schema(
  {
    serviceNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    offering: { type: Schema.Types.ObjectId, ref: 'ServiceOffering', required: true, index: true },
    serviceSnapshot: {
      code: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, required: true },
      description: String,
    },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerSnapshot: {
      name: { type: String, required: true },
      phone: String,
    },
    currency: { type: String, enum: ['USD', 'KHR'], required: true },
    exchangeRate: { type: Number, min: 0, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
    quantity: { type: Number, min: 1, max: 1000, default: 1 },
    subtotal: { type: Number, min: 0, required: true },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, required: true },
    paymentMethod: { type: String, enum: ['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'], default: 'CASH' },
    status: { type: String, enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED', index: true },
    notes: { type: String, trim: true },
    completedAt: { type: Date, default: Date.now, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseOptions,
)

serviceChargeSchema.index({ completedAt: -1, createdAt: -1 })

export const ServiceOffering = model('ServiceOffering', serviceOfferingSchema)
export const ServiceCharge = model('ServiceCharge', serviceChargeSchema)
