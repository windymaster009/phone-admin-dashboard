import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ActivityLog, InventoryItem, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { RepairJob } from './repairModels.js'
import { CustomerPreorder } from './customerPreorderModels.js'
import { ServiceCharge } from './serviceModels.js'
import repairRouter from './repairRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-repair'
mongoose.set('bufferCommands', false)

const owner = { _id: new mongoose.Types.ObjectId(), name: 'Owner', role: 'OWNER', active: true }
const sessionId = 'repair-test-session'
const originals = {
  auth: AuthSession.findOne,
  user: User.findById,
  activity: ActivityLog.prototype.save,
  start: mongoose.startSession,
  job: RepairJob.findById,
  jobFindOne: RepairJob.findOne,
  jobFind: RepairJob.find,
  save: RepairJob.prototype.save,
  stock: InventoryItem.findOneAndUpdate,
  trade: Trade.findOne,
  allocation: Trade.updateOne,
  aggregate: RepairJob.aggregate,
  customerAggregate: CustomerPreorder.aggregate,
  serviceAggregate: ServiceCharge.aggregate,
}

test.beforeEach(() => {
  AuthSession.findOne = async () => ({ sessionId, user: owner._id, expiresAt: new Date(Date.now() + 86_400_000) })
  User.findById = () => ({ select: async () => owner })
  ActivityLog.prototype.save = async function () { return this }
  mongoose.startSession = async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} })
  RepairJob.prototype.save = async function () { return this }
})

test.afterEach(() => {
  AuthSession.findOne = originals.auth
  User.findById = originals.user
  ActivityLog.prototype.save = originals.activity
  mongoose.startSession = originals.start
  RepairJob.findById = originals.job
  RepairJob.findOne = originals.jobFindOne
  RepairJob.find = originals.jobFind
  RepairJob.prototype.save = originals.save
  InventoryItem.findOneAndUpdate = originals.stock
  Trade.findOne = originals.trade
  Trade.updateOne = originals.allocation
  RepairJob.aggregate = originals.aggregate
  CustomerPreorder.aggregate = originals.customerAggregate
  ServiceCharge.aggregate = originals.serviceAggregate
})

function call(method, url, body = {}) {
  return new Promise((resolve) => {
    const token = jwt.sign({ sub: String(owner._id), sid: sessionId }, process.env.JWT_SECRET)
    const req = {
      method, url, originalUrl: url, headers: { authorization: `Bearer ${token}` },
      get(name) { return this.headers[name.toLowerCase()] },
      body, query: {}, params: {}, ip: '127.0.0.1',
    }
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this },
      json(data) { resolve({ status: this.statusCode, body: data }); return this },
      setHeader() {}, getHeader() {},
    }
    repairRouter.handle(req, res, (error) => resolve({ status: error?.status || 404, body: { message: error?.message } }))
  })
}

function job(status, parts = [], events = []) {
  const record = new RepairJob({ repairNo: 'RP-TEST', customerName: 'Customer', device: 'Phone', issue: 'Screen', status, parts, events })
  record.isNew = false
  RepairJob.findById = () => ({ session: async () => record })
  return record
}

test('a repair can be opened directly when it is outside the recent workshop list', async () => {
  const record = job('WAITING_PARTS', [{ source: 'PREORDER', status: 'ORDERED', name: 'Screen', quantity: 1, supplierName: 'Parts shop' }])
  RepairJob.findById = () => ({ lean: async () => record })
  const result = await call('GET', `/${record._id}`)
  assert.equal(result.status, 200)
  assert.equal(result.body.repair.repairNo, 'RP-TEST')
  assert.equal(result.body.repair.parts[0].source, 'PREORDER')
})

test('repair summary counts every job and only linked completed service charges', async () => {
  RepairJob.aggregate = async () => [
    { _id: 'IN_PROGRESS', count: 3 }, { _id: 'WAITING_PARTS', count: 2 },
    { _id: 'READY_PICKUP', count: 1 }, { _id: 'COMPLETED', count: 4 },
  ]
  let paymentPipeline
  ServiceCharge.aggregate = async (pipeline) => {
    paymentPipeline = pipeline
    return [{ _id: 'USD', total: 35.5, count: 2 }, { _id: 'KHR', total: 40000, count: 1 }]
  }
  const result = await call('GET', '/summary')
  assert.equal(result.status, 200)
  assert.equal(result.body.summary.counts.IN_PROGRESS, 3)
  assert.equal(result.body.summary.counts.RECEIVED, 0)
  assert.equal(result.body.summary.counts.WAITING_PARTS, 2)
  assert.deepEqual(result.body.summary.payments, { USD: 35.5, KHR: 40000, count: 3 })
  assert.deepEqual(paymentPipeline[0].$match, { repairJob: { $exists: true, $ne: null }, status: 'COMPLETED' })
})

test('charge options only offer ready or completed repairs', async () => {
  let filter
  RepairJob.find = (query) => {
    filter = query
    return { select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ repairNo: 'RP-READY', status: 'READY_PICKUP' }] }) }) }) }
  }
  const result = await call('GET', '/charge-options')
  assert.equal(result.status, 200)
  assert.deepEqual(filter, { status: { $in: ['READY_PICKUP', 'COMPLETED'] } })
  assert.equal(result.body.repairs[0].repairNo, 'RP-READY')
})

test('cancellation restores only unused reserved stock and keeps installed parts consumed', async () => {
  const stockId = new mongoose.Types.ObjectId()
  const record = job('IN_PROGRESS', [
    { source: 'STOCK', status: 'RESERVED', name: 'Screen', quantity: 2, inventoryItem: stockId },
    { source: 'STOCK', status: 'INSTALLED', name: 'Battery', quantity: 1, inventoryItem: stockId },
    { source: 'PREORDER', status: 'ORDERED', name: 'Cable', quantity: 1 },
  ])
  const updates = []
  InventoryItem.findOneAndUpdate = async (filter, update) => { updates.push({ filter, update }); return { _id: stockId, status: 'ARCHIVED' } }
  const result = await call('PATCH', '/64b8f0a1c9e77b0012a00040/status', { status: 'CANCELLED', note: 'Customer declined' })
  assert.equal(result.status, 200)
  assert.equal(record.status, 'CANCELLED')
  assert.deepEqual(record.parts.map((part) => part.status), ['RELEASED', 'INSTALLED', 'CANCELLED'])
  assert.equal(updates.length, 1)
  assert.equal(updates[0].update.$inc.quantity, 2)
  assert.deepEqual(updates[0].filter.status.$in, ['IN_STOCK', 'ARCHIVED'])
  assert.equal(record.parts[0].returnStockStatus, 'ARCHIVED')
  const second = await call('PATCH', '/64b8f0a1c9e77b0012a00040/status', { status: 'CANCELLED', note: 'Retry' })
  assert.equal(second.status, 409)
  assert.equal(updates.length, 1)
})

test('parts cannot be reserved before customer approval', async () => {
  job('APPROVAL')
  let stockWrites = 0
  InventoryItem.findOneAndUpdate = async () => { stockWrites += 1; return null }
  const result = await call('POST', '/64b8f0a1c9e77b0012a00040/parts/reserve', { inventoryItemId: String(new mongoose.Types.ObjectId()), quantity: 1, requestKey: 'approval-test' })
  assert.equal(result.status, 409)
  assert.equal(stockWrites, 0)
})

test('customer approval requires an audit note before repair starts', async () => {
  const record = job('APPROVAL')
  const missing = await call('PATCH', '/64b8f0a1c9e77b0012a00040/status', { status: 'IN_PROGRESS' })
  assert.equal(missing.status, 400)
  assert.equal(record.status, 'APPROVAL')
  const approved = await call('PATCH', '/64b8f0a1c9e77b0012a00040/status', { status: 'IN_PROGRESS', note: 'Customer approved by phone' })
  assert.equal(approved.status, 200)
  assert.equal(record.status, 'IN_PROGRESS')
  assert.equal(record.events.at(-1).note, 'Customer approved by phone')
})

test('retrying a reserved-part request key does not decrement stock twice', async () => {
  const record = job('IN_PROGRESS', [], [{ action: 'PART_RESERVED', requestKey: 'same-request' }])
  let stockWrites = 0
  InventoryItem.findOneAndUpdate = async () => { stockWrites += 1; return null }
  const result = await call('POST', '/64b8f0a1c9e77b0012a00040/parts/reserve', { inventoryItemId: String(new mongoose.Types.ObjectId()), quantity: 1, requestKey: 'same-request' })
  assert.equal(result.status, 200)
  assert.equal(result.body.repair._id.toString(), record._id.toString())
  assert.equal(stockWrites, 0)
})

test('retrying repair intake returns the existing job instead of creating another', async () => {
  const record = job('RECEIVED')
  RepairJob.findOne = async () => record
  const result = await call('POST', '/', { requestKey: 'intake-once' })
  assert.equal(result.status, 200)
  assert.equal(String(result.body.repair._id), String(record._id))
})

test('a preorder can be received only through a completed matching purchase', async () => {
  const stockId = new mongoose.Types.ObjectId()
  const tradeId = new mongoose.Types.ObjectId()
  const record = job('WAITING_PARTS', [{ source: 'PREORDER', status: 'ORDERED', name: 'Screen', quantity: 2, supplierName: 'Parts supplier' }])
  record.createdAt = new Date('2026-10-15T00:00:00Z')
  const partId = String(record.parts[0]._id)
  const trade = { _id: tradeId, tradeNo: 'BY-TEST', type: 'BUY', status: 'COMPLETED', createdAt: new Date('2026-10-16T00:00:00Z'), items: [{ inventoryItem: stockId, name: 'Vivo Y02s screen assembly', quantity: 2, costPrice: 5 }] }
  Trade.findOne = () => ({ session: async () => trade })
  let locked = 0
  Trade.updateOne = async () => { locked += 1; return { matchedCount: 1 } }
  RepairJob.aggregate = () => ({ session: async () => [] })
  CustomerPreorder.aggregate = () => ({ session: async () => [] })
  const updates = []
  InventoryItem.findOneAndUpdate = async (filter, update) => { updates.push({ filter, update }); return { _id: stockId, name: 'Current stock label', sku: 'SCREEN-1' } }
  const unconfirmed = await call('POST', `/64b8f0a1c9e77b0012a00040/parts/${partId}/receive`, { purchaseTradeId: String(tradeId), inventoryItemId: String(stockId) })
  assert.equal(unconfirmed.status, 400)
  assert.equal(updates.length, 0)
  assert.equal(record.parts[0].name, 'Screen')
  const result = await call('POST', `/64b8f0a1c9e77b0012a00040/parts/${partId}/receive`, { purchaseTradeId: String(tradeId), inventoryItemId: String(stockId), confirmedMatch: true })
  assert.equal(result.status, 200)
  assert.equal(record.status, 'IN_PROGRESS')
  assert.equal(record.parts[0].status, 'RESERVED')
  assert.equal(record.parts[0].name, 'Vivo Y02s screen assembly')
  assert.match(record.events.at(-1).note, /Vivo Y02s screen assembly \(requested as Screen\)/)
  assert.equal(String(record.parts[0].purchaseTrade), String(tradeId))
  assert.equal(locked, 1)
  assert.equal(updates[0].update.$inc.quantity, -2)
  const repeat = await call('POST', `/64b8f0a1c9e77b0012a00040/parts/${partId}/receive`, { purchaseTradeId: String(tradeId), inventoryItemId: String(stockId), confirmedMatch: true })
  assert.equal(repeat.status, 409)
  assert.equal(locked, 1)
  assert.equal(updates.length, 1)
})
