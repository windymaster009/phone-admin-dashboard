import mongoose from 'mongoose'

const { Schema, model } = mongoose

const eventSchema = new Schema({
  action: { type: String, required: true },
  note: String,
  at: { type: Date, default: Date.now },
  by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const preorderSchema = new Schema({
  preorderNo: { type: String, required: true, unique: true, index: true },
  requestKey: { type: String, unique: true, sparse: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  category: { type: String, enum: ['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'], required: true },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, min: 1, max: 1000, required: true },
  specifications: { type: String, trim: true },
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: { type: String, trim: true },
  expectedAt: Date,
  purchaseTrade: { type: Schema.Types.ObjectId, ref: 'Trade' },
  inventoryItem: { type: Schema.Types.ObjectId, ref: 'InventoryItem' },
  saleTrade: { type: Schema.Types.ObjectId, ref: 'Trade' },
  status: { type: String, enum: ['REQUESTED', 'ORDERED', 'ARRIVED', 'COMPLETED', 'CANCELLED'], default: 'REQUESTED', index: true },
  receivedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  events: { type: [eventSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, optimisticConcurrency: true })

preorderSchema.index({ createdAt: -1 })

export const CustomerPreorder = model('CustomerPreorder', preorderSchema)
