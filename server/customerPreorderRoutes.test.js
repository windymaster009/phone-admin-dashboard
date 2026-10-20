import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ActivityLog, InventoryItem, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { RepairJob } from './repairModels.js'
import { CustomerPreorder } from './customerPreorderModels.js'
import preorderRouter from './customerPreorderRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-customer-preorder'
mongoose.set('bufferCommands', false)

const owner = { _id: new mongoose.Types.ObjectId(), name: 'Owner', role: 'OWNER', active: true }
const sessionId = 'customer-preorder-test-session'
const original = {
  auth: AuthSession.findOne,
  user: User.findById,
  activity: ActivityLog.prototype.save,
  session: mongoose.startSession,
  findOne: CustomerPreorder.findOne,
  findById: CustomerPreorder.findById,
  save: CustomerPreorder.prototype.save,
  exists: CustomerPreorder.exists,
  aggregate: CustomerPreorder.aggregate,
  repairAggregate: RepairJob.aggregate,
  trade: Trade.findOne,
  tradeUpdate: Trade.updateOne,
  inventory: InventoryItem.findById,
}

test.beforeEach(() => {
  AuthSession.findOne = async () => ({ sessionId, user: owner._id, expiresAt: new Date(Date.now() + 86_400_000) })
  User.findById = () => ({ select: async () => owner })
  ActivityLog.prototype.save = async function () { return this }
  mongoose.startSession = async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} })
  CustomerPreorder.prototype.save = async function () { return this }
})

test.afterEach(() => {
  AuthSession.findOne = original.auth
  User.findById = original.user
  ActivityLog.prototype.save = original.activity
  mongoose.startSession = original.session
  CustomerPreorder.findOne = original.findOne
  CustomerPreorder.findById = original.findById
  CustomerPreorder.prototype.save = original.save
  CustomerPreorder.exists = original.exists
  CustomerPreorder.aggregate = original.aggregate
  RepairJob.aggregate = original.repairAggregate
  Trade.findOne = original.trade
  Trade.updateOne = original.tradeUpdate
  InventoryItem.findById = original.inventory
})

function call(method, url, body = {}) {
  return new Promise((resolve) => {
    const token = jwt.sign({ sub: String(owner._id), sid: sessionId }, process.env.JWT_SECRET)
    const req = { method, url, originalUrl: url, headers: { authorization: `Bearer ${token}` }, get(name) { return this.headers[name.toLowerCase()] }, body, query: {}, params: {}, ip: '127.0.0.1' }
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(data) { resolve({ status: this.statusCode, body: data }); return this }, setHeader() {}, getHeader() {} }
    preorderRouter.handle(req, res, (error) => resolve({ status: error?.status || 404, body: { message: error?.message } }))
  })
}

function order(status) {
  const record = new CustomerPreorder({ preorderNo: 'PO-TEST', customerName: 'Sela', customerPhone: '0882982042', category: 'ACCESSORY', productName: 'Phone case', quantity: 2, status, events: [{ action: 'REQUESTED' }] })
  record.isNew = false
  record.createdAt = new Date('2026-10-15T00:00:00Z')
  CustomerPreorder.findById = () => ({ session: async () => record })
  return record
}

test('cancelling after arrival leaves the recorded purchase and inventory untouched', async () => {
  const record = order('ARRIVED')
  const tradeId = new mongoose.Types.ObjectId()
  const itemId = new mongoose.Types.ObjectId()
  record.purchaseTrade = tradeId
  record.inventoryItem = itemId
  let inventoryCalls = 0
  InventoryItem.findById = () => { inventoryCalls += 1; throw new Error('Inventory must not be changed') }
  const result = await call('POST', '/64b8f0a1c9e77b0012a00040/cancel', { reason: 'Customer changed their mind' })
  assert.equal(result.status, 200)
  assert.equal(record.status, 'CANCELLED')
  assert.equal(String(record.purchaseTrade), String(tradeId))
  assert.equal(String(record.inventoryItem), String(itemId))
  assert.equal(inventoryCalls, 0)
  const repeat = await call('POST', '/64b8f0a1c9e77b0012a00040/cancel', { reason: 'Retry' })
  assert.equal(repeat.status, 409)
})

test('arrival links a completed purchase without adding inventory twice', async () => {
  const record = order('ORDERED')
  const tradeId = new mongoose.Types.ObjectId()
  const inventoryId = new mongoose.Types.ObjectId()
  const trade = { _id: tradeId, tradeNo: 'BY-TEST', createdAt: new Date('2026-10-16T00:00:00Z'), items: [{ inventoryItem: inventoryId, quantity: 2 }] }
  Trade.findOne = () => ({ session: async () => trade })
  Trade.updateOne = async () => ({ matchedCount: 1 })
  InventoryItem.findById = () => ({ session: async () => ({ _id: inventoryId, sku: 'CASE-1', category: 'ACCESSORY', status: 'IN_STOCK', quantity: 2 }) })
  CustomerPreorder.aggregate = () => ({ session: async () => [] })
  RepairJob.aggregate = () => ({ session: async () => [] })
  const result = await call('POST', '/64b8f0a1c9e77b0012a00040/receive', { purchaseTradeId: String(tradeId), inventoryItemId: String(inventoryId) })
  assert.equal(result.status, 200)
  assert.equal(record.status, 'ARRIVED')
  assert.equal(String(record.purchaseTrade), String(tradeId))
  assert.equal(String(record.inventoryItem), String(inventoryId))
  const retry = await call('POST', '/64b8f0a1c9e77b0012a00040/receive', { purchaseTradeId: String(tradeId), inventoryItemId: String(inventoryId) })
  assert.equal(retry.status, 409)
})

test('a completed sale for another customer cannot fulfill a linked preorder', async () => {
  const record = order('ARRIVED')
  record.customer = new mongoose.Types.ObjectId()
  record.inventoryItem = new mongoose.Types.ObjectId()
  record.receivedAt = new Date('2026-10-16T00:00:00Z')
  const saleId = new mongoose.Types.ObjectId()
  Trade.findOne = () => ({ session: async () => ({ _id: saleId, tradeNo: 'SL-TEST', createdAt: new Date('2026-10-16T01:00:00Z'), customer: new mongoose.Types.ObjectId(), items: [{ inventoryItem: record.inventoryItem, quantity: 2 }] }) })
  const result = await call('POST', '/64b8f0a1c9e77b0012a00040/complete', { saleTradeId: String(saleId) })
  assert.equal(result.status, 409)
  assert.equal(record.status, 'ARRIVED')
})

test('a customer-confirmed sale closes the preorder once without recording another sale', async () => {
  const record = order('ARRIVED')
  record.inventoryItem = new mongoose.Types.ObjectId()
  record.receivedAt = new Date('2026-10-16T00:00:00Z')
  const saleId = new mongoose.Types.ObjectId()
  Trade.findOne = () => ({ session: async () => ({ _id: saleId, tradeNo: 'SL-TEST', createdAt: new Date('2026-10-16T01:00:00Z'), items: [{ inventoryItem: record.inventoryItem, quantity: 2 }] }) })
  Trade.updateOne = async () => ({ matchedCount: 1 })
  CustomerPreorder.exists = () => ({ session: async () => null })
  const unconfirmed = await call('POST', '/64b8f0a1c9e77b0012a00040/complete', { saleTradeId: String(saleId) })
  assert.equal(unconfirmed.status, 400)
  const result = await call('POST', '/64b8f0a1c9e77b0012a00040/complete', { saleTradeId: String(saleId), customerConfirmed: true })
  assert.equal(result.status, 200)
  assert.equal(record.status, 'COMPLETED')
  assert.equal(String(record.saleTrade), String(saleId))
  const retry = await call('POST', '/64b8f0a1c9e77b0012a00040/complete', { saleTradeId: String(saleId), customerConfirmed: true })
  assert.equal(retry.status, 409)
})

test('retrying intake returns the same preorder', async () => {
  const record = order('REQUESTED')
  CustomerPreorder.findOne = async () => record
  const result = await call('POST', '/', { requestKey: 'same-preorder' })
  assert.equal(result.status, 200)
  assert.equal(String(result.body.preorder._id), String(record._id))
})
