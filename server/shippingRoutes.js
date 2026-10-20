import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Customer } from './models.js'
import { Shipment } from './shippingModels.js'

const router = Router()
const allowed = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK']
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const fail = (status, message) => Object.assign(new Error(message), { status })
const statuses = ['PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED']

function validObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw fail(400, `${label} is invalid`)
  return value
}

function safeDate(value, label) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) throw fail(400, `${label} is invalid`)
  return date
}

function shipmentNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()
  return `SHP-${day}-${suffix}`
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 30) {
    throw fail(400, 'Add between 1 and 30 products to the shipment')
  }
  return rawItems.map((raw, index) => {
    const name = clean(raw?.name)
    const quantity = Number(raw?.quantity || 1)
    const sku = clean(raw?.sku)
    const imei = clean(raw?.imei)
    const notes = clean(raw?.notes)
    if (!name) throw fail(400, `Product ${index + 1} needs a name`)
    if (name.length > 180) throw fail(400, `Product ${index + 1} name is too long`)
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw fail(400, `Product ${index + 1} quantity is invalid`)
    if (sku.length > 100 || imei.length > 80 || notes.length > 300) throw fail(400, `Product ${index + 1} details are too long`)
    return { name, quantity, sku, imei, notes }
  })
}

function recordEvent(shipment, req, action, note = '') {
  shipment.events.push({ action, note: clean(note), by: req.user._id, at: new Date() })
}

async function audit(req, shipment, action, details = {}) {
  await writeActivity(req, {
    action,
    entity: 'SHIPMENT',
    entityId: shipment._id,
    details: {
      shipmentNo: shipment.shipmentNo,
      recipientName: shipment.recipientName,
      phone: shipment.recipientPhone,
      status: shipment.status,
      ...details,
    },
  })
}

async function loadShipment(id) {
  if (!mongoose.isValidObjectId(id)) throw fail(400, 'Shipment is invalid')
  const shipment = await Shipment.findById(id)
    .populate('customer', 'name phone address')
    .populate('createdBy updatedBy', 'name role')
    .populate('events.by', 'name role')
  if (!shipment) throw fail(404, 'Shipment was not found')
  return shipment
}

router.get('/', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const filter = {}
  const status = clean(req.query.status).toUpperCase()
  if (status && status !== 'ALL') {
    if (!statuses.includes(status)) throw fail(400, 'Shipment status is invalid')
    filter.status = status
  }

  const search = clean(req.query.search).slice(0, 120)
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [
      { shipmentNo: regex },
      { recipientName: regex },
      { recipientPhone: regex },
      { address: regex },
      { courierName: regex },
      { trackingNumber: regex },
      { 'items.name': regex },
      { 'items.sku': regex },
      { 'items.imei': regex },
    ]
  }

  const shipments = await Shipment.find(filter)
    .populate('createdBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(300)
    .lean()

  res.json({ shipments })
}))

router.get('/summary', requireAuth, allowRoles(...allowed), asyncRoute(async (_req, res) => {
  const rows = await Shipment.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])
  const counts = { PREPARING: 0, READY_TO_SHIP: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 }
  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count
  }
  const labelsPrinted = await Shipment.aggregate([
    { $group: { _id: null, total: { $sum: '$labelPrintCount' } } },
  ])
  res.json({ summary: { counts, labelsPrinted: labelsPrinted[0]?.total || 0 } })
}))

router.get('/:id', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  res.json({ shipment: await loadShipment(req.params.id) })
}))

router.post('/', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const requestKey = clean(req.body.requestKey)
  if (!requestKey || requestKey.length > 100) throw fail(400, 'Request key is required')
  const existing = await Shipment.findOne({ requestKey })
  if (existing) return res.json({ shipment: existing })

  const customerId = req.body.customerId ? validObjectId(req.body.customerId, 'Customer') : undefined
  let customer = null
  if (customerId) {
    customer = await Customer.findById(customerId).select('name phone address active')
    if (!customer || customer.active === false) throw fail(404, 'Customer was not found')
  }

  const recipientName = clean(req.body.recipientName || customer?.name)
  const recipientPhone = clean(req.body.recipientPhone || customer?.phone)
  const address = clean(req.body.address || customer?.address)
  const courierName = clean(req.body.courierName)
  const trackingNumber = clean(req.body.trackingNumber)
  const packageNote = clean(req.body.packageNote)
  const shippingDate = safeDate(req.body.shippingDate, 'Shipping date')
  const items = normalizeItems(req.body.items)

  if (!recipientName || !recipientPhone || !address) throw fail(400, 'Recipient name, phone number, and address are required')
  if (recipientName.length > 120 || recipientPhone.length > 50 || address.length > 500) throw fail(400, 'Recipient details are too long')
  if (courierName.length > 120 || trackingNumber.length > 120 || packageNote.length > 500) throw fail(400, 'Shipping details are too long')

  let shipment
  let created = true
  try {
    shipment = await Shipment.create({
      shipmentNo: shipmentNumber(),
      requestKey,
      customer: customerId,
      recipientName,
      recipientPhone,
      address,
      shippingDate,
      courierName,
      trackingNumber,
      packageNote,
      items,
      status: 'PREPARING',
      createdBy: req.user._id,
      updatedBy: req.user._id,
      events: [{ action: 'CREATED', note: `${items.length} product line${items.length === 1 ? '' : 's'}`, by: req.user._id }],
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    shipment = await Shipment.findOne({ requestKey })
    if (!shipment) throw error
    created = false
  }

  if (created) await audit(req, shipment, 'CREATE', { itemCount: shipment.items.length })
  res.status(created ? 201 : 200).json({ shipment })
}))

router.patch('/:id', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const shipment = await loadShipment(req.params.id)
  if (!['PREPARING', 'READY_TO_SHIP'].includes(shipment.status)) {
    throw fail(409, 'Only preparing or ready shipments can be edited')
  }

  const recipientName = clean(req.body.recipientName ?? shipment.recipientName)
  const recipientPhone = clean(req.body.recipientPhone ?? shipment.recipientPhone)
  const address = clean(req.body.address ?? shipment.address)
  if (!recipientName || !recipientPhone || !address) throw fail(400, 'Recipient name, phone number, and address are required')

  shipment.recipientName = recipientName
  shipment.recipientPhone = recipientPhone
  shipment.address = address
  if (req.body.shippingDate !== undefined) shipment.shippingDate = safeDate(req.body.shippingDate, 'Shipping date')
  if (req.body.courierName !== undefined) shipment.courierName = clean(req.body.courierName)
  if (req.body.trackingNumber !== undefined) shipment.trackingNumber = clean(req.body.trackingNumber)
  if (req.body.packageNote !== undefined) shipment.packageNote = clean(req.body.packageNote)
  if (req.body.items !== undefined) shipment.items = normalizeItems(req.body.items)
  shipment.updatedBy = req.user._id
  recordEvent(shipment, req, 'UPDATED', 'Shipping details updated')
  await shipment.save()
  await audit(req, shipment, 'UPDATE')
  res.json({ shipment })
}))

const transitionMap = {
  PREPARING: ['READY_TO_SHIP'],
  READY_TO_SHIP: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
}

router.post('/:id/status', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const shipment = await loadShipment(req.params.id)
  const nextStatus = clean(req.body.status).toUpperCase()
  if (!['READY_TO_SHIP', 'SHIPPED', 'DELIVERED'].includes(nextStatus)) throw fail(400, 'Choose a valid shipment status')
  if (!(transitionMap[shipment.status] || []).includes(nextStatus)) {
    throw fail(409, `Shipment cannot move from ${shipment.status} to ${nextStatus}`)
  }

  shipment.status = nextStatus
  shipment.updatedBy = req.user._id
  const now = new Date()
  if (nextStatus === 'READY_TO_SHIP') shipment.readyAt = now
  if (nextStatus === 'SHIPPED') shipment.shippedAt = now
  if (nextStatus === 'DELIVERED') shipment.deliveredAt = now
  recordEvent(shipment, req, nextStatus, clean(req.body.note))
  await shipment.save()
  await audit(req, shipment, nextStatus, { courierName: shipment.courierName, trackingNumber: shipment.trackingNumber })
  res.json({ shipment })
}))

router.post('/:id/cancel', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const shipment = await loadShipment(req.params.id)
  if (['DELIVERED', 'CANCELLED'].includes(shipment.status)) throw fail(409, 'This shipment is already closed')
  const reason = clean(req.body.reason)
  if (reason.length < 3 || reason.length > 500) throw fail(400, 'Give a cancellation reason (3–500 characters)')
  shipment.status = 'CANCELLED'
  shipment.cancelledAt = new Date()
  shipment.cancellationReason = reason
  shipment.updatedBy = req.user._id
  recordEvent(shipment, req, 'CANCELLED', reason)
  await shipment.save()
  await audit(req, shipment, 'CANCEL', { reason })
  res.json({ shipment })
}))

router.post('/:id/label-printed', requireAuth, allowRoles(...allowed), asyncRoute(async (req, res) => {
  const shipment = await loadShipment(req.params.id)
  shipment.labelPrintCount = Number(shipment.labelPrintCount || 0) + 1
  shipment.lastLabelPrintedAt = new Date()
  shipment.updatedBy = req.user._id
  recordEvent(shipment, req, 'LABEL_PRINTED', clean(req.body.note) || 'Shipping label printed')
  await shipment.save()
  await audit(req, shipment, 'PRINT_LABEL', { labelPrintCount: shipment.labelPrintCount })
  res.json({ shipment })
}))

export const shipmentTransitions = transitionMap
export default router
