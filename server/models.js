import mongoose from 'mongoose'

const { Schema, model } = mongoose
const baseOptions = { timestamps: true, versionKey: false }

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['OWNER', 'MANAGER', 'CASHIER', 'STOCK'],
      default: 'CASHIER',
      index: true,
    },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  baseOptions,
)

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    nationalIdNumber: { type: String, trim: true, index: true },
    nationalIdFrontUrl: String,
    nationalIdBackUrl: String,
    address: String,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

const inventoryItemSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: {
      type: String,
      enum: ['PHONE', 'ACCESSORY', 'SPARE_PART'],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, index: true },
    brand: { type: String, trim: true, index: true },
    model: { type: String, trim: true, index: true },
    condition: {
      type: String,
      enum: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED'],
      default: 'NEW',
    },
    imei1: { type: String, unique: true, sparse: true, trim: true },
    imei2: { type: String, unique: true, sparse: true, trim: true },
    serialNumber: { type: String, sparse: true, trim: true },
    storage: String,
    color: String,
    batteryHealth: { type: Number, min: 0, max: 100 },
    compatibleModels: [String],
    quantity: { type: Number, min: 0, default: 1 },
    reorderLevel: { type: Number, min: 0, default: 2 },
    buyPrice: { type: Number, min: 0, default: 0 },
    sellPrice: { type: Number, min: 0, default: 0 },
    minimumSellPrice: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ['IN_STOCK', 'RESERVED', 'SOLD', 'PAWNED', 'REPAIR', 'ARCHIVED'],
      default: 'IN_STOCK',
      index: true,
    },
    source: {
      type: String,
      enum: ['SUPPLIER', 'CUSTOMER', 'PAWN_FORFEIT', 'OTHER'],
      default: 'OTHER',
    },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

inventoryItemSchema.pre('validate', function normalizePhone(next) {
  if (this.category === 'PHONE') this.quantity = this.status === 'SOLD' ? 0 : 1
  next()
})

const paymentSchema = new Schema(
  {
    amount: { type: Number, min: 0, required: true },
    type: { type: String, enum: ['INTEREST', 'PRINCIPAL', 'REDEMPTION', 'RENEWAL'], required: true },
    paidAt: { type: Date, default: Date.now },
    note: String,
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true, versionKey: false },
)

const pawnSchema = new Schema(
  {
    pawnNo: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    inventoryItem: { type: Schema.Types.ObjectId, ref: 'InventoryItem' },
    itemSnapshot: {
      name: { type: String, required: true },
      brand: String,
      model: String,
      imei: String,
      condition: String,
      color: String,
      storage: String,
    },
    estimatedValue: { type: Number, min: 0, required: true },
    pawnPercentage: { type: Number, min: 40, max: 50, required: true },
    principal: { type: Number, min: 0, required: true },
    interestRate: { type: Number, min: 0, default: 5 },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED', 'REDEEMED', 'FORFEITED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    identificationVerified: { type: Boolean, default: false },
    payments: [paymentSchema],
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

const tradeLineSchema = new Schema(
  {
    inventoryItem: { type: Schema.Types.ObjectId, ref: 'InventoryItem' },
    name: { type: String, required: true },
    quantity: { type: Number, min: 1, default: 1 },
    unitPrice: { type: Number, min: 0, required: true },
    costPrice: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
)

const tradeSchema = new Schema(
  {
    tradeNo: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['BUY', 'SELL'], required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    items: { type: [tradeLineSchema], validate: [(items) => items.length > 0, 'At least one item is required'] },
    subtotal: { type: Number, min: 0, required: true },
    discount: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, required: true },
    amountPaid: { type: Number, min: 0, default: 0 },
    balance: { type: Number, min: 0, default: 0 },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'BANK', 'CARD', 'OTHER'],
      default: 'CASH',
    },
    status: { type: String, enum: ['COMPLETED', 'CANCELLED', 'RETURNED'], default: 'COMPLETED' },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  baseOptions,
)

const activityLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: Schema.Types.ObjectId,
    details: Schema.Types.Mixed,
    ipAddress: String,
  },
  { ...baseOptions, updatedAt: false },
)

export const User = model('User', userSchema)
export const Customer = model('Customer', customerSchema)
export const InventoryItem = model('InventoryItem', inventoryItemSchema)
export const Pawn = model('Pawn', pawnSchema)
export const Trade = model('Trade', tradeSchema)
export const ActivityLog = model('ActivityLog', activityLogSchema)
