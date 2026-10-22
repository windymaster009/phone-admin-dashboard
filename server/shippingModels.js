import mongoose from 'mongoose'

const { Schema, model } = mongoose

const shipmentItemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, min: 1, max: 1000, required: true },
  sku: { type: String, trim: true },
  imei: { type: String, trim: true },
  notes: { type: String, trim: true },
}, { _id: true })

const shipmentEventSchema = new Schema({
  action: { type: String, required: true },
  note: String,
  at: { type: Date, default: Date.now },
  by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: true })

const shipmentSchema = new Schema({
  shipmentNo: { type: String, required: true, unique: true, index: true },
  requestKey: { type: String, unique: true, sparse: true },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  recipientName: { type: String, required: true, trim: true },
  recipientPhone: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  shippingDate: { type: Date, required: true, default: Date.now, index: true },
  courierName: { type: String, trim: true },
  trackingNumber: { type: String, trim: true, index: true },
  packageNote: { type: String, trim: true },
  items: {
    type: [shipmentItemSchema],
    validate: [(items) => Array.isArray(items) && items.length > 0, 'At least one shipment item is required'],
  },
  status: {
    type: String,
    enum: ['PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    default: 'PREPARING',
    index: true,
  },
  readyAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  labelPrintCount: { type: Number, min: 0, default: 0 },
  lastLabelPrintedAt: Date,
  events: { type: [shipmentEventSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, optimisticConcurrency: true })

shipmentSchema.index({ createdAt: -1 })
shipmentSchema.index({ status: 1, shippingDate: -1 })

export const Shipment = model('Shipment', shipmentSchema)
