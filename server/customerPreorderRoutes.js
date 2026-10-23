import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Customer, InventoryItem, Supplier, Trade } from './models.js'
import { CustomerPreorder } from './customerPreorderModels.js'
import { RepairJob } from './repairModels.js'

const router = Router()
const allowed = ['OWNER', 'MANAGER']
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const fail = (status, message) => Object.assign(new Error(message), { status })

function id(value, label) {
  if (!mongoose.isValidObjectId(value)) throw fail(400, `${label} is invalid`)
  return value
}

function quantity(value) {
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw fail(400, 'Quantity must be a whole number from 1 to 1,000')
  return count
}

async function inTransaction(handler) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => { result = await handler(session) })
    return result
  } finally { await session.endSession() }
}

async function load(idValue, session) {
  const preorder = await CustomerPreorder.findById(id(idValue, 'Preorder')).session(session)
  if (!preorder) throw fail(404, 'Customer preorder was not found')
  return preorder
}

async function audit(req, preorder, action, session, details = {}) {
  await writeActivity(req, { action, entity: 'CUSTOMER_PREORDER', entityId: preorder._id, details: { preorderNo: preorder.preorderNo, ...details } }, { required: true, session })
}

function recordEvent(preorder, req, action, note = '') {
  preorder.events.push({ action, note, by: req.user._id })
}

router.get('/', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const filter = {}
  const status = clean(req.query.status).toUpperCase()
  if (['REQUESTED', 'ORDERED', 'ARRIVED', 'COMPLETED', 'CANCELLED'].includes(status)) filter.status = status
  const search = clean(req.query.search).slice(0, 100)
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ preorderNo: regex }, { customerName: regex }, { customerPhone: regex }, { productName: regex }]
  }
  const preorders = await CustomerPreorder.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  res.json({ preorders })
}))

router.get('/repair-parts', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const status = clean(req.query.status).toUpperCase()
  const search = clean(req.query.search).slice(0, 100)
  const match = { 'parts.source': 'PREORDER' }
  if (['ORDERED', 'RESERVED', 'INSTALLED', 'RELEASED', 'CANCELLED'].includes(status)) match['parts.status'] = status
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    match.$or = [
      { repairNo: regex }, { customerName: regex }, { customerPhone: regex },
      { device: regex }, { 'parts.name': regex }, { 'parts.supplierName': regex },
    ]
  }
  const repairParts = await RepairJob.aggregate([
    { $unwind: '$parts' },
    { $match: match },
    { $sort: { createdAt: -1, 'parts._id': -1 } },
    { $limit: 200 },
    { $project: {
      _id: 0, repairId: '$_id', repairNo: 1, customerName: 1, customerPhone: 1,
      device: 1, repairStatus: '$status', createdAt: 1,
      partId: '$parts._id', name: '$parts.name', quantity: '$parts.quantity',
      supplierName: '$parts.supplierName', expectedAt: '$parts.expectedAt',
      status: '$parts.status', purchaseTrade: '$parts.purchaseTrade',
    } },
  ])
  res.json({ repairParts })
}))

router.get('/:id', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const preorder = await CustomerPreorder.findById(id(req.params.id, 'Preorder')).lean()
  if (!preorder) throw fail(404, 'Customer preorder was not found')
  res.setHeader('Cache-Control', 'no-store')
  res.json({ preorder })
}))

router.post('/', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const requestKey = clean(req.body.requestKey)
  if (!requestKey || requestKey.length > 100) throw fail(400, 'Request key is required')
  const existing = await CustomerPreorder.findOne({ requestKey })
  if (existing) return res.json({ preorder: existing })
  const customerId = req.body.customerId ? id(req.body.customerId, 'Customer') : undefined
  const customerName = clean(req.body.customerName)
  const customerPhone = clean(req.body.customerPhone)
  const category = clean(req.body.category).toUpperCase()
  const productName = clean(req.body.productName)
  const specifications = clean(req.body.specifications)
  const count = quantity(req.body.quantity)
  if (!customerName || !customerPhone || !productName) throw fail(400, 'Customer name, phone, and product are required')
  if (!['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'].includes(category)) throw fail(400, 'Choose a product category')
  if (customerName.length > 120 || customerPhone.length > 40 || productName.length > 160 || specifications.length > 1000) throw fail(400, 'A preorder field is too long')
  let preorder
  let created = true
  try {
    preorder = await inTransaction(async (session) => {
      if (customerId) {
        const customer = await Customer.findById(customerId).session(session)
        if (!customer || customer.active === false) throw fail(404, 'Customer was not found')
        if (customer.name !== customerName || customer.phone !== customerPhone) throw fail(409, 'Customer details changed. Select the customer again')
      }
      const preorderNo = `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()}`
      const [createdOrder] = await CustomerPreorder.create([{ preorderNo, requestKey, customer: customerId, customerName, customerPhone, category, productName, quantity: count, specifications, createdBy: req.user._id, events: [{ action: 'REQUESTED', by: req.user._id }] }], { session })
      await audit(req, createdOrder, 'CREATE', session)
      return createdOrder
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    preorder = await CustomerPreorder.findOne({ requestKey })
    if (!preorder) throw error
    created = false
  }
  res.status(created ? 201 : 200).json({ preorder })
}))

router.post('/:id/order', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  if (!req.body.supplierId) throw fail(400, 'Select an existing supplier')
  const supplierId = id(req.body.supplierId, 'Supplier')
  const expectedAt = req.body.expectedAt ? new Date(req.body.expectedAt) : undefined
  if (expectedAt && Number.isNaN(expectedAt.getTime())) throw fail(400, 'Expected date is invalid')
  const preorder = await inTransaction(async (session) => {
    const current = await load(req.params.id, session)
    if (current.status !== 'REQUESTED') throw fail(409, 'Only a new request can be marked ordered')
    const supplier = await Supplier.findById(supplierId).session(session)
    if (!supplier || supplier.active === false) throw fail(409, 'Supplier is unavailable. Select an active supplier')
    current.status = 'ORDERED'
    current.supplier = supplier._id
    current.supplierName = supplier.name
    current.expectedAt = expectedAt
    recordEvent(current, req, 'ORDERED', `Supplier: ${supplier.name}`)
    await current.save({ session })
    await audit(req, current, 'ORDERED', session, { supplierId: String(supplier._id), supplierName: supplier.name })
    return current
  })
  res.json({ preorder })
}))

router.post('/:id/receive', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const purchaseId = id(req.body.purchaseTradeId, 'Purchase')
  const inventoryId = id(req.body.inventoryItemId, 'Inventory item')
  const preorder = await inTransaction(async (session) => {
    const current = await load(req.params.id, session)
    if (current.status !== 'ORDERED') throw fail(409, 'Only an ordered product can be received')
    const trade = await Trade.findOne({ _id: purchaseId, type: 'BUY', status: 'COMPLETED' }).session(session)
    if (!trade || trade.createdAt < current.createdAt) throw fail(409, 'Choose a completed purchase made after the request')
    const line = trade.items.find((entry) => String(entry.inventoryItem) === String(inventoryId))
    if (!line || Number(line.quantity) < current.quantity) throw fail(409, 'Purchase does not contain the requested quantity')
    const item = await InventoryItem.findById(inventoryId).session(session)
    if (!item || item.category !== current.category) throw fail(409, 'Purchased item category does not match the preorder')
    if (item.status !== 'IN_STOCK' || Number(item.quantity) < current.quantity) throw fail(409, 'Purchased product is no longer available in the requested quantity')
    const allocationLock = await Trade.updateOne({ _id: trade._id, status: 'COMPLETED' }, { $inc: { preorderAllocationVersion: 1 } }, { session })
    if (allocationLock.matchedCount !== 1) throw fail(409, 'Purchase is no longer available')
    const otherOrders = await CustomerPreorder.aggregate([
      { $match: { purchaseTrade: trade._id, inventoryItem: item._id, status: { $in: ['ARRIVED', 'COMPLETED'] } } },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ]).session(session)
    const repairs = await RepairJob.aggregate([
      { $unwind: '$parts' },
      { $match: { 'parts.purchaseTrade': trade._id, 'parts.inventoryItem': item._id, 'parts.status': { $in: ['RESERVED', 'INSTALLED'] } } },
      { $group: { _id: null, quantity: { $sum: '$parts.quantity' } } },
    ]).session(session)
    if (Number(otherOrders[0]?.quantity || 0) + Number(repairs[0]?.quantity || 0) + current.quantity > Number(line.quantity)) throw fail(409, 'Purchase quantity is already allocated')
    // Linking the purchase is documentary. Its stock count and financial total
    // were already recorded by Buy & Sell; do not apply either again here.
    current.purchaseTrade = trade._id
    current.inventoryItem = item._id
    current.status = 'ARRIVED'
    current.receivedAt = new Date()
    recordEvent(current, req, 'ARRIVED', `Purchase ${trade.tradeNo} · ${item.sku}`)
    await current.save({ session })
    await audit(req, current, 'ARRIVED', session, { purchaseTradeId: String(trade._id), inventoryItemId: String(item._id) })
    return current
  })
  res.json({ preorder })
}))

router.post('/:id/complete', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const saleId = id(req.body.saleTradeId, 'Sale')
  const preorder = await inTransaction(async (session) => {
    const current = await load(req.params.id, session)
    if (current.status !== 'ARRIVED') throw fail(409, 'Only an arrived preorder can be completed')
    const trade = await Trade.findOne({ _id: saleId, type: 'SELL', status: 'COMPLETED' }).session(session)
    if (!trade || trade.createdAt < current.receivedAt) throw fail(409, 'Choose a completed sale made after arrival')
    const soldQuantity = trade.items.filter((entry) => String(entry.inventoryItem) === String(current.inventoryItem)).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
    if (soldQuantity < current.quantity) throw fail(409, 'Sale does not contain the ordered quantity of this product')
    if (current.customer && String(trade.customer || '') !== String(current.customer)) throw fail(409, 'Sale customer does not match the preorder customer')
    if (!current.customer && req.body.customerConfirmed !== true) throw fail(400, 'Confirm this sale belongs to the preorder customer')
    const allocationLock = await Trade.updateOne({ _id: trade._id, status: 'COMPLETED' }, { $inc: { preorderAllocationVersion: 1 } }, { session })
    if (allocationLock.matchedCount !== 1) throw fail(409, 'Sale is no longer available')
    const linked = await CustomerPreorder.exists({ saleTrade: trade._id, _id: { $ne: current._id } }).session(session)
    if (linked) throw fail(409, 'Sale is already linked to another preorder')
    current.saleTrade = trade._id
    current.status = 'COMPLETED'
    current.completedAt = new Date()
    recordEvent(current, req, 'COMPLETED', `Sale ${trade.tradeNo}`)
    await current.save({ session })
    await audit(req, current, 'COMPLETED', session, { saleTradeId: String(trade._id), customerConfirmed: !current.customer })
    return current
  })
  res.json({ preorder })
}))

router.post('/:id/cancel', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const reason = clean(req.body.reason)
  if (reason.length < 3 || reason.length > 500) throw fail(400, 'Give a cancellation reason (3–500 characters)')
  const preorder = await inTransaction(async (session) => {
    const current = await load(req.params.id, session)
    if (['COMPLETED', 'CANCELLED'].includes(current.status)) throw fail(409, 'Preorder is already closed')
    current.status = 'CANCELLED'
    current.cancelledAt = new Date()
    current.cancellationReason = reason
    recordEvent(current, req, 'CANCELLED', reason)
    await current.save({ session })
    await audit(req, current, 'CANCELLED', session, { reason, purchaseTradeId: String(current.purchaseTrade || '') })
    return current
  })
  res.json({ preorder })
}))

export default router
