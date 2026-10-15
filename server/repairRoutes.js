import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Customer } from './models.js'
import { RepairTicket } from './repairModels.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const operationalRoles = allowRoles('OWNER', 'MANAGER', 'CASHIER', 'STOCK')

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function makeRepairNo() {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll('-', '')
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RP-${stamp}-${random}`
}

function addTimeline(ticket, req, action, label, note = '', itemId) {
  ticket.timeline.push({
    action,
    label,
    note: clean(note),
    itemId,
    user: req.user?._id,
    at: new Date(),
  })
}

function itemPrice(input) {
  const partCost = roundMoney(input.partCost)
  const serviceFee = roundMoney(input.serviceFee)
  const supplied = input.customerPrice === undefined || input.customerPrice === ''
    ? partCost + serviceFee
    : Number(input.customerPrice)
  if (![partCost, serviceFee, supplied].every((value) => Number.isFinite(value) && value >= 0)) {
    throw requestError(400, 'Repair prices must be zero or greater')
  }
  return { partCost, serviceFee, customerPrice: roundMoney(supplied) }
}

function ticketTotals(ticket) {
  const totals = {
    partCost: 0,
    serviceFee: 0,
    approvedTotal: 0,
    pendingTotal: 0,
    potentialTotal: 0,
    grossProfit: 0,
  }

  for (const item of ticket.items || []) {
    if (['DECLINED', 'CANCELLED'].includes(item.status)) continue
    totals.potentialTotal += Number(item.customerPrice || 0)
    if (item.status === 'PENDING_APPROVAL') {
      totals.pendingTotal += Number(item.customerPrice || 0)
      continue
    }
    totals.partCost += Number(item.partCost || 0)
    totals.serviceFee += Number(item.serviceFee || 0)
    totals.approvedTotal += Number(item.customerPrice || 0)
    totals.grossProfit += Number(item.customerPrice || 0) - Number(item.partCost || 0)
  }

  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundMoney(value)]))
}

function decorateTicket(ticket) {
  const value = typeof ticket.toObject === 'function' ? ticket.toObject() : ticket
  return { ...value, totals: ticketTotals(value) }
}

function recalculateTicketStatus(ticket) {
  if (['COMPLETED', 'CANCELLED'].includes(ticket.status)) return

  const items = ticket.items || []
  if (items.some((item) => item.status === 'PENDING_APPROVAL')) {
    ticket.status = 'WAITING_APPROVAL'
    return
  }

  const activeItems = items.filter((item) => !['DECLINED', 'CANCELLED'].includes(item.status))
  if (activeItems.length > 0 && activeItems.every((item) => item.status === 'DONE')) {
    ticket.status = 'READY_FOR_PICKUP'
    return
  }

  if (activeItems.some((item) => ['APPROVED', 'IN_PROGRESS', 'DONE'].includes(item.status))) {
    ticket.status = 'IN_REPAIR'
    return
  }

  ticket.status = 'CHECKING'
}

async function populatedTicket(id) {
  return RepairTicket.findById(id)
    .populate('customer', 'name phone nationalIdNumber address')
    .populate('createdBy updatedBy cancelledBy', 'name role')
    .populate('items.addedBy items.approvedBy items.declinedBy items.cancelledBy', 'name role')
    .populate('timeline.user', 'name role')
}

router.get('/', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  const search = clean(req.query.search)
  const status = clean(req.query.status).toUpperCase()
  const query = {}
  if (status && status !== 'ALL') query.status = status
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    query.$or = [
      { repairNo: regex },
      { 'customerSnapshot.name': regex },
      { 'customerSnapshot.phone': regex },
      { 'device.brand': regex },
      { 'device.model': regex },
      { 'device.imei': regex },
      { initialProblem: regex },
    ]
  }

  const tickets = await RepairTicket.find(query)
    .populate('customer', 'name phone')
    .populate('createdBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(300)
    .lean()

  res.json({ repairs: tickets.map(decorateTicket) })
}))

router.get('/summary', requireAuth, operationalRoles, asyncRoute(async (_req, res) => {
  const tickets = await RepairTicket.find({}).select('status items').lean()
  const counts = {
    total: tickets.length,
    received: 0,
    checking: 0,
    waitingApproval: 0,
    inRepair: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
  }
  let approvedValue = 0
  let pendingValue = 0

  for (const ticket of tickets) {
    if (ticket.status === 'RECEIVED') counts.received += 1
    if (ticket.status === 'CHECKING') counts.checking += 1
    if (ticket.status === 'WAITING_APPROVAL') counts.waitingApproval += 1
    if (ticket.status === 'IN_REPAIR') counts.inRepair += 1
    if (ticket.status === 'READY_FOR_PICKUP') counts.ready += 1
    if (ticket.status === 'COMPLETED') counts.completed += 1
    if (ticket.status === 'CANCELLED') counts.cancelled += 1
    const totals = ticketTotals(ticket)
    approvedValue += totals.approvedTotal
    pendingValue += totals.pendingTotal
  }

  res.json({
    summary: {
      counts,
      approvedValue: roundMoney(approvedValue),
      pendingValue: roundMoney(pendingValue),
    },
  })
}))

router.get('/:id', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Repair ticket is invalid')
  const repair = await populatedTicket(req.params.id)
  if (!repair) throw requestError(404, 'Repair ticket was not found')
  res.json({ repair: decorateTicket(repair) })
}))

router.post('/', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  let customer = null
  if (req.body.customerId) {
    if (!mongoose.isValidObjectId(req.body.customerId)) throw requestError(400, 'Choose a valid customer')
    customer = await Customer.findById(req.body.customerId).select('name phone nationalIdNumber address active')
    if (!customer || customer.active === false) throw requestError(404, 'Customer was not found')
  }

  const customerName = customer?.name || clean(req.body.customerName)
  const customerPhone = customer?.phone || clean(req.body.customerPhone)
  if (!customerName || !customerPhone) throw requestError(400, 'Customer name and phone number are required')

  const model = clean(req.body.device?.model)
  const initialProblem = clean(req.body.initialProblem)
  if (!model) throw requestError(400, 'Device model is required')
  if (!initialProblem) throw requestError(400, 'Describe the repair problem')

  const initialItem = req.body.initialItem || {}
  const repairType = clean(initialItem.repairType)
  if (!repairType) throw requestError(400, 'Initial repair type is required')
  const pricing = itemPrice(initialItem)

  const expectedFinishAt = req.body.expectedFinishAt ? new Date(req.body.expectedFinishAt) : undefined
  if (expectedFinishAt && Number.isNaN(expectedFinishAt.getTime())) throw requestError(400, 'Expected finish date is invalid')

  const ticket = await RepairTicket.create({
    repairNo: makeRepairNo(),
    customer: customer?._id,
    customerSnapshot: {
      name: customerName,
      phone: customerPhone,
      nationalIdNumber: customer?.nationalIdNumber || clean(req.body.nationalIdNumber),
      address: customer?.address || clean(req.body.address),
    },
    device: {
      brand: clean(req.body.device?.brand),
      model,
      imei: clean(req.body.device?.imei),
      serialNumber: clean(req.body.device?.serialNumber),
      color: clean(req.body.device?.color),
      condition: clean(req.body.device?.condition),
      accessoriesReceived: Array.isArray(req.body.device?.accessoriesReceived)
        ? req.body.device.accessoriesReceived.map(clean).filter(Boolean).slice(0, 20)
        : [],
    },
    initialProblem,
    expectedFinishAt,
    notes: clean(req.body.notes),
    items: [{
      repairType,
      problemDescription: clean(initialItem.problemDescription || initialProblem),
      ...pricing,
      status: 'APPROVED',
      approvalMethod: clean(initialItem.approvalMethod || 'IN_SHOP').toUpperCase(),
      approvalNote: clean(initialItem.approvalNote || 'Initial repair requested by customer'),
      approvedAt: new Date(),
      approvedBy: req.user._id,
      addedBy: req.user._id,
    }],
    timeline: [{
      action: 'CREATE',
      label: 'Repair received',
      note: initialProblem,
      user: req.user._id,
      at: new Date(),
    }],
    createdBy: req.user._id,
    updatedBy: req.user._id,
  })

  await writeActivity(req, {
    action: 'CREATE',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: {
      repairNo: ticket.repairNo,
      customer: customerName,
      phone: customerPhone,
      device: [ticket.device.brand, ticket.device.model].filter(Boolean).join(' '),
      approvedTotal: ticketTotals(ticket).approvedTotal,
    },
  })

  const repair = await populatedTicket(ticket._id)
  res.status(201).json({ repair: decorateTicket(repair) })
}))

router.post('/:id/items', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Repair ticket is invalid')
  const ticket = await RepairTicket.findById(req.params.id)
  if (!ticket) throw requestError(404, 'Repair ticket was not found')
  if (['COMPLETED', 'CANCELLED'].includes(ticket.status)) throw requestError(409, 'This repair ticket is closed')

  const repairType = clean(req.body.repairType)
  if (!repairType) throw requestError(400, 'Repair type is required')
  const pricing = itemPrice(req.body)
  const alreadyApproved = req.body.alreadyApproved === true
  const approvalMethod = clean(req.body.approvalMethod || 'IN_SHOP').toUpperCase()
  if (alreadyApproved && !['IN_SHOP', 'PHONE', 'TELEGRAM', 'MESSENGER', 'OTHER'].includes(approvalMethod)) {
    throw requestError(400, 'Choose a valid approval method')
  }

  ticket.items.push({
    repairType,
    problemDescription: clean(req.body.problemDescription),
    ...pricing,
    status: alreadyApproved ? 'APPROVED' : 'PENDING_APPROVAL',
    approvalMethod: alreadyApproved ? approvalMethod : undefined,
    approvalNote: alreadyApproved ? clean(req.body.approvalNote) : undefined,
    approvedAt: alreadyApproved ? new Date() : undefined,
    approvedBy: alreadyApproved ? req.user._id : undefined,
    addedBy: req.user._id,
  })
  const item = ticket.items[ticket.items.length - 1]
  ticket.updatedBy = req.user._id
  addTimeline(
    ticket,
    req,
    'ADD_ITEM',
    alreadyApproved ? `Added approved repair: ${repairType}` : `Added repair for approval: ${repairType}`,
    clean(req.body.problemDescription),
    item._id,
  )
  recalculateTicketStatus(ticket)
  await ticket.save()

  await writeActivity(req, {
    action: 'ADD_ITEM',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, repairType, customerPrice: pricing.customerPrice, approvalRequired: !alreadyApproved },
  })

  const repair = await populatedTicket(ticket._id)
  res.status(201).json({ repair: decorateTicket(repair) })
}))

async function getTicketAndItem(repairId, itemId) {
  if (!mongoose.isValidObjectId(repairId) || !mongoose.isValidObjectId(itemId)) {
    throw requestError(400, 'Repair item is invalid')
  }
  const ticket = await RepairTicket.findById(repairId)
  if (!ticket) throw requestError(404, 'Repair ticket was not found')
  const item = ticket.items.id(itemId)
  if (!item) throw requestError(404, 'Repair item was not found')
  return { ticket, item }
}

router.post('/:id/items/:itemId/approve', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  const { ticket, item } = await getTicketAndItem(req.params.id, req.params.itemId)
  if (item.status !== 'PENDING_APPROVAL') throw requestError(409, 'Only pending repair items can be approved')
  const method = clean(req.body.approvalMethod || 'IN_SHOP').toUpperCase()
  if (!['IN_SHOP', 'PHONE', 'TELEGRAM', 'MESSENGER', 'OTHER'].includes(method)) throw requestError(400, 'Choose a valid approval method')

  item.status = 'APPROVED'
  item.approvalMethod = method
  item.approvalNote = clean(req.body.note)
  item.approvedAt = new Date()
  item.approvedBy = req.user._id
  ticket.updatedBy = req.user._id
  addTimeline(ticket, req, 'APPROVE_ITEM', `Customer approved: ${item.repairType}`, item.approvalNote, item._id)
  recalculateTicketStatus(ticket)
  await ticket.save()

  await writeActivity(req, {
    action: 'APPROVE',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, repairType: item.repairType, customerPrice: item.customerPrice, approvalMethod: method },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

router.post('/:id/items/:itemId/decline', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  const { ticket, item } = await getTicketAndItem(req.params.id, req.params.itemId)
  if (item.status !== 'PENDING_APPROVAL') throw requestError(409, 'Only pending repair items can be declined')
  const reason = clean(req.body.reason)
  if (!reason) throw requestError(400, 'Decline reason is required')

  item.status = 'DECLINED'
  item.approvalNote = reason
  item.declinedAt = new Date()
  item.declinedBy = req.user._id
  ticket.updatedBy = req.user._id
  addTimeline(ticket, req, 'DECLINE_ITEM', `Customer declined: ${item.repairType}`, reason, item._id)
  recalculateTicketStatus(ticket)
  await ticket.save()

  await writeActivity(req, {
    action: 'DECLINE',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, repairType: item.repairType, reason },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

router.post('/:id/items/:itemId/start', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  const { ticket, item } = await getTicketAndItem(req.params.id, req.params.itemId)
  if (item.status !== 'APPROVED') throw requestError(409, 'Only approved repair items can be started')

  item.status = 'IN_PROGRESS'
  item.startedAt = new Date()
  ticket.updatedBy = req.user._id
  addTimeline(ticket, req, 'START_ITEM', `Started repair: ${item.repairType}`, '', item._id)
  recalculateTicketStatus(ticket)
  await ticket.save()

  await writeActivity(req, {
    action: 'START',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, repairType: item.repairType },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

router.post('/:id/items/:itemId/complete', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  const { ticket, item } = await getTicketAndItem(req.params.id, req.params.itemId)
  if (!['APPROVED', 'IN_PROGRESS'].includes(item.status)) throw requestError(409, 'Only approved or in-progress items can be completed')

  item.status = 'DONE'
  if (!item.startedAt) item.startedAt = new Date()
  item.completedAt = new Date()
  ticket.updatedBy = req.user._id
  addTimeline(ticket, req, 'COMPLETE_ITEM', `Completed repair: ${item.repairType}`, clean(req.body.note), item._id)
  recalculateTicketStatus(ticket)
  await ticket.save()

  await writeActivity(req, {
    action: 'COMPLETE_ITEM',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, repairType: item.repairType, customerPrice: item.customerPrice },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

router.post('/:id/items/:itemId/cancel', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  const { ticket, item } = await getTicketAndItem(req.params.id, req.params.itemId)
  if (['DONE', 'DECLINED', 'CANCELLED'].includes(item.status)) throw requestError(409, 'This repair item cannot be cancelled')
  const reason = clean(req.body.reason)
  if (!reason) throw requestError(400, 'Cancellation reason is required')

  item.status = 'CANCELLED'
  item.cancelReason = reason
  item.cancelledAt = new Date()
  item.cancelledBy = req.user._id
  ticket.updatedBy = req.user._id
  addTimeline(ticket, req, 'CANCEL_ITEM', `Cancelled repair item: ${item.repairType}`, reason, item._id)
  recalculateTicketStatus(ticket)
  await ticket.save()

  await writeActivity(req, {
    action: 'CANCEL_ITEM',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, repairType: item.repairType, reason },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

const allowedTransitions = {
  RECEIVED: ['CHECKING'],
  CHECKING: ['IN_REPAIR'],
  WAITING_APPROVAL: ['IN_REPAIR'],
  IN_REPAIR: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['IN_REPAIR', 'COMPLETED'],
}

router.post('/:id/status', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Repair ticket is invalid')
  const ticket = await RepairTicket.findById(req.params.id)
  if (!ticket) throw requestError(404, 'Repair ticket was not found')
  if (['COMPLETED', 'CANCELLED'].includes(ticket.status)) throw requestError(409, 'This repair ticket is closed')

  const nextStatus = clean(req.body.status).toUpperCase()
  if (!(allowedTransitions[ticket.status] || []).includes(nextStatus)) {
    throw requestError(409, `Cannot move repair from ${ticket.status} to ${nextStatus}`)
  }

  if (nextStatus === 'IN_REPAIR' && ticket.items.some((item) => item.status === 'PENDING_APPROVAL')) {
    throw requestError(409, 'Resolve pending customer approvals before starting repair')
  }

  if (nextStatus === 'READY_FOR_PICKUP') {
    const unfinished = ticket.items.some((item) => ['APPROVED', 'IN_PROGRESS', 'PENDING_APPROVAL'].includes(item.status))
    if (unfinished) throw requestError(409, 'Complete or cancel all active repair items before marking ready')
  }

  if (nextStatus === 'COMPLETED' && ticket.status !== 'READY_FOR_PICKUP') {
    throw requestError(409, 'Repair must be ready for pickup before completion')
  }

  ticket.status = nextStatus
  ticket.updatedBy = req.user._id
  if (nextStatus === 'COMPLETED') ticket.completedAt = new Date()
  addTimeline(ticket, req, 'STATUS', `Repair status changed to ${nextStatus.replaceAll('_', ' ').toLowerCase()}`, clean(req.body.note))
  await ticket.save()

  await writeActivity(req, {
    action: nextStatus === 'COMPLETED' ? 'COMPLETE' : 'STATUS',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, status: nextStatus, approvedTotal: ticketTotals(ticket).approvedTotal },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

router.post('/:id/cancel', requireAuth, operationalRoles, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Repair ticket is invalid')
  const ticket = await RepairTicket.findById(req.params.id)
  if (!ticket) throw requestError(404, 'Repair ticket was not found')
  if (ticket.status === 'CANCELLED') throw requestError(409, 'Repair ticket is already cancelled')
  if (ticket.status === 'COMPLETED') throw requestError(409, 'Completed repairs cannot be cancelled')

  const reason = clean(req.body.reason)
  if (!reason) throw requestError(400, 'Cancellation reason is required')

  const hasStartedWork = ticket.items.some((item) => ['IN_PROGRESS', 'DONE'].includes(item.status))
  if (hasStartedWork && !['OWNER', 'MANAGER'].includes(req.user.role)) {
    throw requestError(403, 'Manager approval is required to cancel a repair after work has started')
  }

  for (const item of ticket.items) {
    if (['PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS'].includes(item.status)) {
      item.status = 'CANCELLED'
      item.cancelReason = reason
      item.cancelledAt = new Date()
      item.cancelledBy = req.user._id
    }
  }

  ticket.status = 'CANCELLED'
  ticket.cancelReason = reason
  ticket.cancelledAt = new Date()
  ticket.cancelledBy = req.user._id
  ticket.updatedBy = req.user._id
  addTimeline(ticket, req, 'CANCEL', 'Repair ticket cancelled', reason)
  await ticket.save()

  await writeActivity(req, {
    action: 'CANCEL',
    entity: 'REPAIR',
    entityId: ticket._id,
    details: { repairNo: ticket.repairNo, reason, approvedTotal: ticketTotals(ticket).approvedTotal },
  })

  const repair = await populatedTicket(ticket._id)
  res.json({ repair: decorateTicket(repair) })
}))

export default router
