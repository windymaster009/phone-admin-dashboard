import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Customer, InventoryItem, Trade } from './models.js'
import { RepairJob } from './repairModels.js'
import { CustomerPreorder } from './customerPreorderModels.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const fail = (status, message) => Object.assign(new Error(message), { status })
const editable = ['OWNER', 'MANAGER', 'STOCK']
const transitions = {
  RECEIVED: ['DIAGNOSIS', 'CANCELLED'],
  DIAGNOSIS: ['APPROVAL', 'CANCELLED'],
  APPROVAL: ['IN_PROGRESS', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['QUALITY_CHECK', 'WAITING_PARTS', 'CANCELLED'],
  QUALITY_CHECK: ['READY_PICKUP', 'IN_PROGRESS', 'CANCELLED'],
  READY_PICKUP: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

function wholeQuantity(value) {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw fail(400, 'Quantity must be a positive whole number')
  return count
}

function requireId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw fail(400, `${label} is invalid`)
  return value
}

function event(job, req, action, note = '', requestKey = '') {
  job.events.push({ action, note, requestKey, by: req.user._id })
}

function mutationKey(req) {
  const key = clean(req.body.requestKey)
  if (!key || key.length > 100) throw fail(400, 'Request key is required')
  return key
}

async function transaction(handler) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => { result = await handler(session) })
    return result
  } finally {
    await session.endSession()
  }
}

async function loadJob(id, session) {
  const job = await RepairJob.findById(requireId(id, 'Repair')).session(session)
  if (!job) throw fail(404, 'Repair was not found')
  return job
}

async function audit(req, job, action, session, details = {}) {
  await writeActivity(req, { action, entity: 'REPAIR', entityId: job._id, details: { repairNo: job.repairNo, ...details } }, { required: true, session })
}

router.get('/', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const status = clean(req.query.status).toUpperCase()
  const filter = transitions[status] ? { status } : {}
  const repairs = await RepairJob.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  res.json({ repairs })
}))

router.post('/', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const requestKey = mutationKey(req)
  const existing = await RepairJob.findOne({ requestKey })
  if (existing) return res.json({ repair: existing })
  const customerName = clean(req.body.customerName)
  const customerPhone = clean(req.body.customerPhone)
  const device = clean(req.body.device)
  const issue = clean(req.body.issue)
  const imeiOrSerial = clean(req.body.imeiOrSerial)
  if (!customerName || !device || !issue) throw fail(400, 'Customer, device, and issue are required')
  if (customerName.length > 120 || customerPhone.length > 40 || device.length > 160 || issue.length > 2000 || imeiOrSerial.length > 160) throw fail(400, 'A repair field is too long')
  const customerId = req.body.customerId ? requireId(req.body.customerId, 'Customer') : undefined
  let job
  let created = true
  try {
    job = await transaction(async (session) => {
      if (customerId && !(await Customer.exists({ _id: customerId }).session(session))) throw fail(404, 'Customer was not found')
      const repairNo = `RP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()}`
      const [created] = await RepairJob.create([{ repairNo, requestKey, customer: customerId, customerName, customerPhone, device, issue, imeiOrSerial, createdBy: req.user._id, events: [{ action: 'RECEIVED', by: req.user._id }] }], { session })
      await audit(req, created, 'CREATE', session)
      return created
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    job = await RepairJob.findOne({ requestKey })
    if (!job) throw error
    created = false
  }
  res.status(created ? 201 : 200).json({ repair: job })
}))

router.patch('/:id/status', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const next = clean(req.body.status).toUpperCase()
  const note = clean(req.body.note)
  if (note.length > 1000) throw fail(400, 'Note is too long')
  const job = await transaction(async (session) => {
    const current = await loadJob(req.params.id, session)
    if (!transitions[current.status].includes(next)) throw fail(409, 'This repair status change is not allowed')
    if (current.status === 'APPROVAL' && next === 'IN_PROGRESS' && !note) throw fail(400, 'Record how the customer approved this repair')
    if (next === 'IN_PROGRESS' && current.parts.some((part) => part.status === 'ORDERED')) throw fail(409, 'Receive or cancel pending preorders first')
    if (next === 'QUALITY_CHECK' && current.parts.some((part) => part.status === 'RESERVED')) throw fail(409, 'Install or release reserved parts before quality check')
    if (next === 'COMPLETED' && current.parts.some((part) => ['ORDERED', 'RESERVED'].includes(part.status))) throw fail(409, 'Resolve pending parts before completing repair')
    if (next === 'CANCELLED') {
      if (!note) throw fail(400, 'Give a reason for cancellation')
      for (const part of current.parts) {
        if (part.status === 'RESERVED') {
          const item = await InventoryItem.findOneAndUpdate({ _id: part.inventoryItem, category: { $in: ['SPARE_PART', 'ACCESSORY', 'OTHER'] }, status: { $in: ['IN_STOCK', 'ARCHIVED'] } }, { $inc: { quantity: part.quantity } }, { new: true, session })
          if (!item) throw fail(409, `Could not return ${part.name} to stock; check its inventory record`)
          part.status = 'RELEASED'
          part.releasedAt = new Date()
          part.returnStockStatus = item.status
        } else if (part.status === 'ORDERED') {
          part.status = 'CANCELLED'
        }
      }
    }
    const previous = current.status
    current.status = next
    event(current, req, next, note)
    await current.save({ session })
    await audit(req, current, 'STATUS', session, { from: previous, to: next, note })
    return current
  })
  res.json({ repair: job })
}))

router.post('/:id/parts/reserve', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const requestKey = mutationKey(req)
  const quantity = wholeQuantity(req.body.quantity)
  const inventoryId = requireId(req.body.inventoryItemId, 'Inventory item')
  const job = await transaction(async (session) => {
    const current = await loadJob(req.params.id, session)
    const repeated = current.events.find((entry) => entry.requestKey === requestKey)
    if (repeated) {
      if (repeated.action !== 'PART_RESERVED') throw fail(409, 'Request key was used for another action')
      return current
    }
    if (!['WAITING_PARTS', 'IN_PROGRESS'].includes(current.status)) throw fail(409, 'Approve the repair before reserving parts')
    const item = await InventoryItem.findOneAndUpdate({ _id: inventoryId, category: { $in: ['SPARE_PART', 'ACCESSORY', 'OTHER'] }, status: 'IN_STOCK', quantity: { $gte: quantity } }, { $inc: { quantity: -quantity } }, { new: true, session })
    if (!item) throw fail(409, 'Part is unavailable or has insufficient stock')
    current.parts.push({ source: 'STOCK', status: 'RESERVED', name: item.name, quantity, inventoryItem: item._id, sku: item.sku, unitCostUsd: item.buyPrice, reservedAt: new Date() })
    event(current, req, 'PART_RESERVED', `${quantity} × ${item.name}`, requestKey)
    await current.save({ session })
    await audit(req, current, 'PART_RESERVED', session, { inventoryItemId: String(item._id), quantity })
    return current
  })
  res.json({ repair: job })
}))

router.post('/:id/parts/preorder', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const requestKey = mutationKey(req)
  const name = clean(req.body.name)
  const supplierName = clean(req.body.supplierName)
  const quantity = wholeQuantity(req.body.quantity)
  if (!name || !supplierName || name.length > 160 || supplierName.length > 120) throw fail(400, 'Part and supplier names are required')
  const expectedAt = req.body.expectedAt ? new Date(req.body.expectedAt) : undefined
  if (expectedAt && Number.isNaN(expectedAt.getTime())) throw fail(400, 'Expected date is invalid')
  const job = await transaction(async (session) => {
    const current = await loadJob(req.params.id, session)
    const repeated = current.events.find((entry) => entry.requestKey === requestKey)
    if (repeated) {
      if (repeated.action !== 'PART_ORDERED') throw fail(409, 'Request key was used for another action')
      return current
    }
    if (!['WAITING_PARTS', 'IN_PROGRESS'].includes(current.status)) throw fail(409, 'Approve the repair before ordering parts')
    current.parts.push({ source: 'PREORDER', status: 'ORDERED', name, supplierName, quantity, expectedAt })
    current.status = 'WAITING_PARTS'
    event(current, req, 'PART_ORDERED', `${quantity} × ${name} from ${supplierName}`, requestKey)
    await current.save({ session })
    await audit(req, current, 'PART_ORDERED', session, { name, supplierName, quantity })
    return current
  })
  res.json({ repair: job })
}))

router.post('/:id/parts/:partId/receive', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const tradeId = requireId(req.body.purchaseTradeId, 'Purchase')
  const inventoryId = requireId(req.body.inventoryItemId, 'Inventory item')
  const job = await transaction(async (session) => {
    const current = await loadJob(req.params.id, session)
    if (current.status !== 'WAITING_PARTS') throw fail(409, 'Repair is not waiting for parts')
    const part = current.parts.id(requireId(req.params.partId, 'Part'))
    if (!part || part.source !== 'PREORDER' || part.status !== 'ORDERED') throw fail(409, 'Preorder is no longer awaiting receipt')
    const trade = await Trade.findOne({ _id: tradeId, type: 'BUY', status: 'COMPLETED' }).session(session)
    if (!trade || trade.createdAt < current.createdAt) throw fail(409, 'Choose a completed purchase recorded for this repair')
    const line = trade.items.find((entry) => String(entry.inventoryItem) === String(inventoryId))
    if (!line || Number(line.quantity) < part.quantity) throw fail(409, 'Purchase does not contain enough of this inventory item')
    // All receipts against one purchase write the same trade document. Concurrent
    // transactions then conflict and retry before checking linked quantities.
    const allocationLock = await Trade.updateOne({ _id: trade._id, status: 'COMPLETED' }, { $inc: { preorderAllocationVersion: 1 } }, { session })
    if (allocationLock.matchedCount !== 1) throw fail(409, 'Purchase is no longer available')
    const alreadyLinked = await RepairJob.aggregate([
      { $unwind: '$parts' },
      { $match: { 'parts.purchaseTrade': trade._id, 'parts.inventoryItem': new mongoose.Types.ObjectId(inventoryId), 'parts.status': { $in: ['RESERVED', 'INSTALLED'] } } },
      { $group: { _id: null, quantity: { $sum: '$parts.quantity' } } },
    ]).session(session)
    const customerLinked = await CustomerPreorder.aggregate([
      { $match: { purchaseTrade: trade._id, inventoryItem: new mongoose.Types.ObjectId(inventoryId), status: { $in: ['ARRIVED', 'COMPLETED'] } } },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ]).session(session)
    if (Number(alreadyLinked[0]?.quantity || 0) + Number(customerLinked[0]?.quantity || 0) + part.quantity > Number(line.quantity)) throw fail(409, 'Purchase quantity is already allocated')
    const item = await InventoryItem.findOneAndUpdate({ _id: inventoryId, category: { $in: ['SPARE_PART', 'ACCESSORY', 'OTHER'] }, status: 'IN_STOCK', quantity: { $gte: part.quantity } }, { $inc: { quantity: -part.quantity } }, { new: true, session })
    if (!item) throw fail(409, 'Purchased part is not available in stock')
    part.status = 'RESERVED'
    part.inventoryItem = item._id
    part.sku = item.sku
    part.unitCostUsd = line.costPrice
    part.purchaseTrade = trade._id
    part.reservedAt = new Date()
    if (!current.parts.some((entry) => entry.status === 'ORDERED')) current.status = 'IN_PROGRESS'
    event(current, req, 'PART_RECEIVED', `${part.quantity} × ${part.name} via ${trade.tradeNo}`)
    await current.save({ session })
    await audit(req, current, 'PART_RECEIVED', session, { purchaseTradeId: String(trade._id), inventoryItemId: String(item._id), quantity: part.quantity })
    return current
  })
  res.json({ repair: job })
}))

router.post('/:id/parts/:partId/install', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const job = await transaction(async (session) => {
    const current = await loadJob(req.params.id, session)
    if (current.status !== 'IN_PROGRESS') throw fail(409, 'Repair must be in progress to install a part')
    const part = current.parts.id(requireId(req.params.partId, 'Part'))
    if (!part || part.status !== 'RESERVED') throw fail(409, 'Part is not reserved')
    part.status = 'INSTALLED'
    part.installedAt = new Date()
    event(current, req, 'PART_INSTALLED', `${part.quantity} × ${part.name}`)
    await current.save({ session })
    await audit(req, current, 'PART_INSTALLED', session, { partId: String(part._id), quantity: part.quantity })
    return current
  })
  res.json({ repair: job })
}))

router.post('/:id/parts/:partId/release', requireAuth, allowRoles(...editable), asyncRoute(async (req, res) => {
  const job = await transaction(async (session) => {
    const current = await loadJob(req.params.id, session)
    if (['CANCELLED', 'COMPLETED'].includes(current.status)) throw fail(409, 'Repair is closed')
    const part = current.parts.id(requireId(req.params.partId, 'Part'))
    if (!part || !['RESERVED', 'ORDERED'].includes(part.status)) throw fail(409, 'Only unused parts can be released')
    if (part.status === 'RESERVED') {
      const item = await InventoryItem.findOneAndUpdate({ _id: part.inventoryItem, category: { $in: ['SPARE_PART', 'ACCESSORY', 'OTHER'] }, status: { $in: ['IN_STOCK', 'ARCHIVED'] } }, { $inc: { quantity: part.quantity } }, { new: true, session })
      if (!item) throw fail(409, 'Could not restore part to stock')
      part.status = 'RELEASED'
      part.releasedAt = new Date()
      part.returnStockStatus = item.status
    } else part.status = 'CANCELLED'
    event(current, req, 'PART_RELEASED', `${part.quantity} × ${part.name}`)
    await current.save({ session })
    await audit(req, current, 'PART_RELEASED', session, { partId: String(part._id), quantity: part.quantity })
    return current
  })
  res.json({ repair: job })
}))

export default router
