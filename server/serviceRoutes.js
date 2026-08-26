import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Customer } from './models.js'
import { ServiceCharge, ServiceOffering } from './serviceModels.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const clean = (value) => typeof value === 'string' ? value.trim() : ''
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const defaultServices = [
  ['GMAIL_SETUP', 'Gmail account setup', 'ACCOUNT_SETUP', 'Create and configure a Gmail account safely.'],
  ['TELEGRAM_SETUP', 'Telegram account setup', 'ACCOUNT_SETUP', 'Set up Telegram and basic privacy controls.'],
  ['APPLE_ID_SETUP', 'Apple ID setup', 'ACCOUNT_SETUP', 'Create or configure an Apple ID on the customer device.'],
  ['FACEBOOK_SETUP', 'Facebook account setup', 'ACCOUNT_SETUP', 'Create an account and configure basic security.'],
  ['WHATSAPP_SETUP', 'WhatsApp setup', 'ACCOUNT_SETUP', 'Install and configure WhatsApp for the customer.'],
  ['PHONE_SETUP', 'New phone setup', 'DEVICE_SETUP', 'Initial setup, updates, language, and basic preferences.'],
  ['DATA_TRANSFER', 'Phone data transfer', 'DATA_TRANSFER', 'Move supported contacts, photos, and files to another device.'],
  ['APP_INSTALL', 'App installation', 'SOFTWARE', 'Install and configure customer-requested applications.'],
  ['OTHER_SERVICE', 'Other service', 'OTHER', 'Record another paid shop service.'],
].map(([code, name, category, description]) => ({ code, name, category, description, currency: 'USD', price: 0, active: true }))

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function fallbackExchangeRate() {
  const configured = Number(process.env.USD_KHR_FALLBACK_RATE || 4100)
  return Number.isFinite(configured) && configured > 0 ? configured : 4100
}

async function ensureDefaultServices() {
  await Promise.all(defaultServices.map((service) => ServiceOffering.updateOne(
    { code: service.code },
    { $setOnInsert: service },
    { upsert: true },
  )))
}

function makeServiceNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const random = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `SV-${date}-${random}`
}

router.get('/catalog', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  await ensureDefaultServices()
  const includeInactive = req.query.includeInactive === 'true' && ['OWNER', 'MANAGER'].includes(req.user.role)
  const search = clean(req.query.search)
  const category = clean(req.query.category).toUpperCase()
  const query = includeInactive ? {} : { active: true }
  if (category && category !== 'ALL') query.category = category
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i')
    query.$or = [{ name: regex }, { code: regex }, { description: regex }]
  }
  const services = await ServiceOffering.find(query).sort({ category: 1, name: 1 }).lean()
  res.json({ services, exchangeRate: fallbackExchangeRate() })
}))

router.patch('/catalog/:id', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Service ID is invalid')
  const update = { updatedBy: req.user._id }
  if (req.body.price !== undefined) {
    const price = Number(req.body.price)
    if (!Number.isFinite(price) || price < 0) throw requestError(400, 'Price must be zero or greater')
    update.price = roundMoney(price)
  }
  if (req.body.currency !== undefined) {
    const currency = clean(req.body.currency).toUpperCase()
    if (!['USD', 'KHR'].includes(currency)) throw requestError(400, 'Currency must be USD or KHR')
    update.currency = currency
  }
  if (req.body.active !== undefined) update.active = Boolean(req.body.active)
  const service = await ServiceOffering.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true })
  if (!service) throw requestError(404, 'Service was not found')
  await writeActivity(req, {
    action: 'UPDATE', entity: 'SERVICE_OFFERING', entityId: service._id,
    details: { code: service.code, name: service.name, price: service.price, currency: service.currency, active: service.active },
  })
  res.json({ service })
}))

router.get('/charges', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const search = clean(req.query.search)
  const status = clean(req.query.status).toUpperCase()
  const query = {}
  if (status && status !== 'ALL') query.status = status
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i')
    query.$or = [{ serviceNo: regex }, { 'serviceSnapshot.name': regex }, { 'customerSnapshot.name': regex }, { 'customerSnapshot.phone': regex }]
  }
  const charges = await ServiceCharge.find(query)
    .populate('customer', 'name phone')
    .populate('createdBy', 'name role')
    .sort({ completedAt: -1, createdAt: -1 })
    .limit(100)
    .lean()
  res.json({ charges })
}))

router.post('/charges', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.offeringId)) throw requestError(400, 'Choose a valid service')
  const offering = await ServiceOffering.findById(req.body.offeringId)
  if (!offering || !offering.active) throw requestError(404, 'This service is no longer available')
  if (!(Number(offering.price) > 0)) throw requestError(409, 'Set a price for this service before charging the customer')

  let customer = null
  if (req.body.customerId) {
    if (!mongoose.isValidObjectId(req.body.customerId)) throw requestError(400, 'Choose a valid customer')
    customer = await Customer.findById(req.body.customerId).select('name phone active')
    if (!customer || customer.active === false) throw requestError(404, 'Customer was not found')
  }
  const walkInName = clean(req.body.customerName) || 'Walk-in customer'
  const quantity = Number(req.body.quantity || 1)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw requestError(400, 'Quantity must be between 1 and 1,000')
  const discount = roundMoney(Number(req.body.discount || 0))
  const subtotal = roundMoney(Number(offering.price) * quantity)
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw requestError(400, 'Discount cannot exceed the service subtotal')
  const paymentMethod = clean(req.body.paymentMethod || 'CASH').toUpperCase()
  if (!['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'].includes(paymentMethod)) throw requestError(400, 'Choose a valid payment method')
  const notes = clean(req.body.notes)
  if (notes.length > 500) throw requestError(400, 'Notes must be 500 characters or fewer')

  const charge = await ServiceCharge.create({
    serviceNo: makeServiceNo(),
    offering: offering._id,
    serviceSnapshot: { code: offering.code, name: offering.name, category: offering.category, description: offering.description },
    customer: customer?._id,
    customerSnapshot: { name: customer?.name || walkInName, phone: customer?.phone || clean(req.body.customerPhone) },
    currency: offering.currency,
    exchangeRate: offering.currency === 'KHR' ? fallbackExchangeRate() : 1,
    unitPrice: offering.price,
    quantity,
    subtotal,
    discount,
    total: roundMoney(subtotal - discount),
    paymentMethod,
    notes,
    createdBy: req.user._id,
  })
  await writeActivity(req, {
    action: 'CREATE', entity: 'SERVICE_CHARGE', entityId: charge._id,
    details: { serviceNo: charge.serviceNo, service: offering.name, customer: charge.customerSnapshot.name, total: charge.total, currency: charge.currency },
  })
  res.status(201).json({ charge: await charge.populate('customer createdBy', 'name phone role') })
}))

export default router
