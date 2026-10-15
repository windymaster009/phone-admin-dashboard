import mongoose from 'mongoose'

const { Schema, model } = mongoose
const baseOptions = { timestamps: true, versionKey: false }

const repairItemSchema = new Schema(
  {
    repairType: { type: String, required: true, trim: true },
    problemDescription: { type: String, trim: true },
    partCost: { type: Number, min: 0, default: 0 },
    serviceFee: { type: Number, min: 0, default: 0 },
    customerPrice: { type: Number, min: 0, required: true },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
      default: 'PENDING_APPROVAL',
      index: true,
    },
    approvalMethod: {
      type: String,
      enum: ['IN_SHOP', 'PHONE', 'TELEGRAM', 'MESSENGER', 'OTHER'],
    },
    approvalNote: { type: String, trim: true },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    declinedAt: Date,
    declinedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String, trim: true },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
)

const repairTimelineSchema = new Schema(
  {
    action: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    note: { type: String, trim: true },
    itemId: Schema.Types.ObjectId,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: true, versionKey: false },
)

const repairTicketSchema = new Schema(
  {
    repairNo: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerSnapshot: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      nationalIdNumber: { type: String, trim: true },
      address: { type: String, trim: true },
    },
    device: {
      brand: { type: String, trim: true },
      model: { type: String, required: true, trim: true },
      imei: { type: String, trim: true, index: true },
      serialNumber: { type: String, trim: true },
      color: { type: String, trim: true },
      condition: { type: String, trim: true },
      accessoriesReceived: [{ type: String, trim: true }],
    },
    initialProblem: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['RECEIVED', 'CHECKING', 'WAITING_APPROVAL', 'IN_REPAIR', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'],
      default: 'RECEIVED',
      index: true,
    },
    expectedFinishAt: Date,
    receivedAt: { type: Date, default: Date.now, index: true },
    completedAt: Date,
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String, trim: true },
    notes: { type: String, trim: true },
    items: { type: [repairItemSchema], default: [] },
    timeline: { type: [repairTimelineSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

repairTicketSchema.index({ createdAt: -1 })
repairTicketSchema.index({ 'customerSnapshot.name': 1, 'customerSnapshot.phone': 1 })

export const RepairTicket = model('RepairTicket', repairTicketSchema)
