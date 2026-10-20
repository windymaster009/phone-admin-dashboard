import mongoose from 'mongoose'

const { Schema, model } = mongoose

const partSchema = new Schema({
  source: { type: String, enum: ['STOCK', 'PREORDER'], required: true },
  status: { type: String, enum: ['ORDERED', 'RESERVED', 'INSTALLED', 'RELEASED', 'CANCELLED'], required: true },
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  inventoryItem: { type: Schema.Types.ObjectId, ref: 'InventoryItem' },
  sku: String,
  unitCostUsd: { type: Number, min: 0 },
  supplierName: String,
  expectedAt: Date,
  purchaseTrade: { type: Schema.Types.ObjectId, ref: 'Trade' },
  reservedAt: Date,
  installedAt: Date,
  releasedAt: Date,
  returnStockStatus: { type: String, enum: ['IN_STOCK', 'ARCHIVED'] },
}, { _id: true })

const eventSchema = new Schema({
  action: { type: String, required: true },
  requestKey: String,
  note: String,
  at: { type: Date, default: Date.now },
  by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const repairSchema = new Schema({
  repairNo: { type: String, required: true, unique: true, index: true },
  requestKey: { type: String, unique: true, sparse: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone: { type: String, trim: true },
  device: { type: String, required: true, trim: true },
  imeiOrSerial: { type: String, trim: true },
  issue: { type: String, required: true, trim: true },
  status: { type: String, enum: ['RECEIVED', 'DIAGNOSIS', 'APPROVAL', 'WAITING_PARTS', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY_PICKUP', 'COMPLETED', 'CANCELLED'], default: 'RECEIVED', index: true },
  parts: { type: [partSchema], default: [] },
  events: { type: [eventSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, optimisticConcurrency: true })

repairSchema.index({ createdAt: -1 })

export const RepairJob = model('RepairJob', repairSchema)
