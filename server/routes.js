import { Router } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, signToken, writeActivity } from './auth.js'
import { ActivityLog, Customer, InventoryItem, Pawn, Supplier, Trade, User } from './models.js'

const router = Router()

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => (typeof value === 'string' ? value.trim() : value)
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let exchangeRateCache = null
const EXCHANGE_RATE_CACHE_MS = 30 * 60 * 1000

function fallbackExchangeRate() {
  const configuredRate = Number(process.env.USD_KHR_FALLBACK_RATE || 4100)
  return Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 4100
}

function makeCode(prefix) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const random = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `${prefix}-${date}-${random}`
}

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function paymentState(total, paid) {
  if (paid <= 0) return 'UNPAID'
  if (paid + 0.000001 < total) return 'PARTIAL'
  return 'PAID'
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  }
}

async function refreshPawnStatuses() {
  const now = new Date()
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const open = ['ACTIVE', 'DUE_SOON', 'RENEWED']

  await Pawn.updateMany({ status: { $in: open }, dueDate: { $lt: now } }, { $set: { status: 'OVERDUE' } })
  await Pawn.updateMany(
    { status: { $in: ['ACTIVE', 'RENEWED'] }, dueDate: { $gte: now, $lte: soon } },
    { $set: { status: 'DUE_SOON' } },
  )
}

router.get('/auth/status', asyncRoute(async (_req, res) => {
  const setupRequired = (await User.estimatedDocumentCount()) === 0
  res.json({ setupRequired })
}))

router.post('/auth/bootstrap', asyncRoute(async (req, res) => {
  if ((await User.estimatedDocumentCount()) > 0) {
    return res.status(409).json({ message: 'The owner account has already been created' })
  }

  const name = clean(req.body.name)
  const email = clean(req.body.email)?.toLowerCase()
  const password = req.body.password

  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Name, email and a password of at least 8 characters are required' })
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'OWNER',
  })

  res.status(201).json({ token: signToken(user), user: publicUser(user) })
}))

router.post('/auth/login', asyncRoute(async (req, res) => {
  const email = clean(req.body.email)?.toLowerCase()
  const user = await User.findOne({ email })

  if (!user || !user.active || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const token = signToken(user)
  res.json({ token, user: publicUser(user) })

  // Login history is useful but must never turn valid credentials into a 500.
  void User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
    .catch((error) => console.error(`[request ${req.id || 'unknown'}] Last-login update failed:`, error.message))
}))

router.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }))

router.get('/users', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (_req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 })
  res.json({ users })
}))

router.post('/users', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  const { name, email, password, role = 'CASHIER' } = req.body
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Valid name, email and password are required' })
  }

  const user = await User.create({
    name: clean(name),
    email: clean(email).toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    role,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'USER', entityId: user._id, details: { role } })
  res.status(201).json({ user: publicUser(user) })
}))

router.get('/dashboard', requireAuth, asyncRoute(async (_req, res) => {
  await refreshPawnStatuses()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const month = new Date(now.getFullYear(), now.getMonth(), 1)
  const year = new Date(now.getFullYear(), 0, 1)

  const [salesToday, purchasesToday, activePawnValue, phonesInStock, overdueContracts, lowStock, customerCount, pawnCount] = await Promise.all([
    Trade.aggregate([{ $match: { type: 'SELL', status: 'COMPLETED', createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Trade.aggregate([{ $match: { type: 'BUY', status: 'COMPLETED', createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Pawn.aggregate([{ $match: { status: { $in: ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'] } } }, { $group: { _id: null, total: { $sum: '$principal' } } }]),
    InventoryItem.countDocuments({ category: 'PHONE', status: 'IN_STOCK', quantity: { $gt: 0 } }),
    Pawn.countDocuments({ status: 'OVERDUE' }),
    InventoryItem.countDocuments({ status: 'IN_STOCK', $expr: { $lte: ['$quantity', '$reorderLevel'] } }),
    Customer.estimatedDocumentCount(),
    Pawn.estimatedDocumentCount(),
  ])

  const [recentPawns, recentTrades, inventoryMix, monthPerformance, monthlyPerformance, dailyPerformance] = await Promise.all([
    Pawn.find().populate('customer', 'name phone nationalIdNumber').sort({ createdAt: -1 }).limit(6),
    Trade.find().populate('customer', 'name phone').populate('supplier', 'name phone nationalIdNumber').sort({ createdAt: -1 }).limit(6),
    InventoryItem.aggregate([
      { $match: { status: { $ne: 'ARCHIVED' } } },
      { $group: { _id: '$category', count: { $sum: '$quantity' }, value: { $sum: { $multiply: ['$quantity', '$buyPrice'] } } } },
    ]),
    Trade.aggregate([
      { $match: { status: 'COMPLETED', createdAt: { $gte: month } } },
      { $group: { _id: '$type', total: { $sum: '$total' } } },
    ]),
    Trade.aggregate([
      { $match: { status: 'COMPLETED', createdAt: { $gte: year } } },
      {
        $group: {
          _id: { month: { $month: '$createdAt' }, type: '$type' },
          total: { $sum: '$total' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
    Trade.aggregate([
      { $match: { status: 'COMPLETED', createdAt: { $gte: month } } },
      {
        $group: {
          _id: { day: { $dayOfMonth: '$createdAt' }, type: '$type' },
          total: { $sum: '$total' },
        },
      },
      { $sort: { '_id.day': 1 } },
    ]),
  ])

  res.json({
    metrics: {
      salesToday: salesToday[0]?.total || 0,
      purchasesToday: purchasesToday[0]?.total || 0,
      activePawnValue: activePawnValue[0]?.total || 0,
      phonesInStock,
      overdueContracts,
      lowStock,
      customerCount,
      pawnCount,
    },
    recentPawns,
    recentTrades,
    inventoryMix,
    monthPerformance,
    monthlyPerformance,
    dailyPerformance,
  })
}))

router.get('/customers', requireAuth, asyncRoute(async (req, res) => {
  const q = clean(req.query.q || '')
  const filter = q
    ? { $or: [{ name: { $regex: q, $options: 'i' } }, { phone: { $regex: q, $options: 'i' } }, { nationalIdNumber: { $regex: q, $options: 'i' } }] }
    : {}
  const customers = await Customer.find(filter).sort({ createdAt: -1 }).limit(250)
  res.json({ customers })
}))

router.post('/customers', requireAuth, asyncRoute(async (req, res) => {
  const { name, phone, nationalIdNumber, nationalIdFrontUrl, nationalIdBackUrl, address, notes } = req.body
  if (!name || !phone) return res.status(400).json({ message: 'Customer name and phone are required' })

  const customer = await Customer.create({
    name: clean(name), phone: clean(phone), nationalIdNumber: clean(nationalIdNumber),
    nationalIdFrontUrl, nationalIdBackUrl, address: clean(address), notes: clean(notes), createdBy: req.user._id,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'CUSTOMER', entityId: customer._id })
  res.status(201).json({ customer })
}))

router.patch('/customers/:id', requireAuth, asyncRoute(async (req, res) => {
  const allowed = ['name', 'phone', 'nationalIdNumber', 'nationalIdFrontUrl', 'nationalIdBackUrl', 'address', 'notes']
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
  const customer = await Customer.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  if (!customer) return res.status(404).json({ message: 'Customer not found' })
  await writeActivity(req, { action: 'UPDATE', entity: 'CUSTOMER', entityId: customer._id, details: update })
  res.json({ customer })
}))

router.get('/suppliers', requireAuth, asyncRoute(async (req, res) => {
  const q = clean(req.query.q || '')
  const filter = req.query.includeInactive === 'true' ? {} : { active: { $ne: false } }
  if (q) filter.$or = [
    { name: { $regex: escapeRegex(q), $options: 'i' } },
    { phone: { $regex: escapeRegex(q), $options: 'i' } },
    { nationalIdNumber: { $regex: escapeRegex(q), $options: 'i' } },
  ]
  const suppliers = await Supplier.find(filter).sort({ name: 1 }).limit(250)
  res.json({ suppliers })
}))

router.post('/suppliers', requireAuth, asyncRoute(async (req, res) => {
  const name = clean(req.body.name)
  if (!name) return res.status(400).json({ message: 'Supplier name is required' })
  const supplier = await Supplier.create({
    name,
    phone: clean(req.body.phone),
    nationalIdNumber: clean(req.body.nationalIdNumber),
    notes: clean(req.body.notes),
    createdBy: req.user._id,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'SUPPLIER', entityId: supplier._id })
  res.status(201).json({ supplier })
}))

router.patch('/suppliers/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const allowed = ['name', 'phone', 'nationalIdNumber', 'notes', 'active']
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
  if (update.name !== undefined) {
    update.name = clean(update.name)
    if (!update.name) return res.status(400).json({ message: 'Supplier name is required' })
  }
  for (const field of ['phone', 'nationalIdNumber', 'notes']) {
    if (update[field] !== undefined) update[field] = clean(update[field])
  }
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' })
  await writeActivity(req, { action: 'UPDATE', entity: 'SUPPLIER', entityId: supplier._id, details: update })
  res.json({ supplier })
}))

router.get('/inventory', requireAuth, asyncRoute(async (req, res) => {
  const q = clean(req.query.q || '')
  const filter = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.status) filter.status = req.query.status
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$quantity', '$reorderLevel'] }
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } }, { brand: { $regex: q, $options: 'i' } },
    { model: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } },
    { barcode: { $regex: q, $options: 'i' } },
    { imei1: { $regex: q, $options: 'i' } }, { serialNumber: { $regex: q, $options: 'i' } },
  ]
  const items = await InventoryItem.find(filter).sort({ createdAt: -1 }).limit(500)
  res.json({ items })
}))

router.get('/inventory/scan/:code', requireAuth, asyncRoute(async (req, res) => {
  const code = clean(decodeURIComponent(req.params.code || '')).toUpperCase()
  if (!code) return res.status(400).json({ message: 'Scan a barcode, SKU, IMEI, or serial number' })
  const exactCode = new RegExp(`^${escapeRegex(code)}$`, 'i')

  const item = await InventoryItem.findOne({
    $or: [
      { barcode: exactCode },
      { sku: exactCode },
      { imei1: exactCode },
      { imei2: exactCode },
      { serialNumber: exactCode },
    ],
  })
  if (!item) return res.status(404).json({ message: `No product found for ${code}` })
  res.json({ item })
}))

router.post('/inventory', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const item = await InventoryItem.create({
    ...req.body,
    sku: clean(req.body.sku || makeCode('STK')),
    barcode: clean(req.body.barcode || makeCode('PF')),
    createdBy: req.user._id,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'INVENTORY', entityId: item._id, details: { sku: item.sku } })
  res.status(201).json({ item })
}))

router.patch('/inventory/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const forbidden = ['_id', 'createdAt', 'updatedAt', 'createdBy']
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => !forbidden.includes(key)))
  const current = await InventoryItem.findById(req.params.id).select('sellPrice minimumSellPrice')
  if (!current) return res.status(404).json({ message: 'Inventory item not found' })
  const nextSellPrice = update.sellPrice === undefined ? current.sellPrice : Number(update.sellPrice)
  const nextMinimumPrice = update.minimumSellPrice === undefined ? current.minimumSellPrice : Number(update.minimumSellPrice)
  if (!Number.isFinite(nextSellPrice) || nextSellPrice < 0 || !Number.isFinite(nextMinimumPrice) || nextMinimumPrice < 0) {
    return res.status(400).json({ message: 'Selling prices must be valid positive amounts or zero' })
  }
  if (nextSellPrice > 0 && nextMinimumPrice > nextSellPrice) {
    return res.status(400).json({ message: 'Discount or minimum price cannot exceed the regular selling price' })
  }
  const item = await InventoryItem.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  await writeActivity(req, { action: 'UPDATE', entity: 'INVENTORY', entityId: item._id, details: update })
  res.json({ item })
}))

router.post('/valuation/calculate', requireAuth, (req, res) => {
  const marketPrice = Number(req.body.marketPrice || 0)
  const ageMonths = Number(req.body.ageMonths || 0)
  const condition = req.body.condition || 'GOOD'
  const repairCost = Number(req.body.repairCost || 0)
  const missingAccessoriesPercent = Number(req.body.missingAccessoriesPercent || 0)
  const pawnPercentage = Math.min(50, Math.max(40, Number(req.body.pawnPercentage || 45)))
  const conditionRates = { NEW: 0, LIKE_NEW: 0.05, GOOD: 0.12, FAIR: 0.22, DAMAGED: 0.4 }
  const ageRate = Math.min(0.5, ageMonths * 0.0125)
  const conditionDeduction = marketPrice * (conditionRates[condition] ?? 0.12)
  const ageDeduction = marketPrice * ageRate
  const accessoryDeduction = marketPrice * Math.min(0.2, Math.max(0, missingAccessoriesPercent / 100))
  const estimatedValue = Math.max(0, marketPrice - ageDeduction - conditionDeduction - accessoryDeduction - repairCost)
  const maximumPawn = estimatedValue * (pawnPercentage / 100)

  res.json({
    marketPrice, ageDeduction, conditionDeduction, accessoryDeduction, repairCost,
    estimatedValue: Math.round(estimatedValue * 100) / 100,
    pawnPercentage,
    maximumPawn: Math.round(maximumPawn * 100) / 100,
  })
})

router.get('/exchange-rates', requireAuth, asyncRoute(async (_req, res) => {
  if (exchangeRateCache && Date.now() - exchangeRateCache.cachedAt < EXCHANGE_RATE_CACHE_MS) {
    return res.json(exchangeRateCache.payload)
  }

  const fallbackRate = fallbackExchangeRate()
  const apiUrl = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD'

  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })
    const payload = await response.json()
    if (!response.ok || payload?.result !== 'success') throw new Error(payload?.['error-type'] || `Rate provider returned ${response.status}`)

    const usdKhr = Number(payload?.rates?.KHR)
    if (!Number.isFinite(usdKhr) || usdKhr <= 0) throw new Error('Rate response did not include USD/KHR')

    const result = {
      usdKhr,
      source: 'ExchangeRate-API',
      rateType: 'reference',
      configured: true,
      updatedAt: payload.time_last_update_utc || new Date().toISOString(),
    }
    exchangeRateCache = { payload: result, cachedAt: Date.now() }
    return res.json(result)
  } catch (error) {
    console.error('Exchange-rate request failed:', error.message)
    return res.json({
      usdKhr: fallbackRate,
      source: 'configured-fallback',
      rateType: 'fallback',
      configured: false,
      updatedAt: new Date().toISOString(),
      warning: 'Live exchange rate is temporarily unavailable',
    })
  }
}))

router.get('/pawns', requireAuth, asyncRoute(async (req, res) => {
  await refreshPawnStatuses()
  const filter = req.query.status ? { status: req.query.status } : {}
  const pawns = await Pawn.find(filter)
    .populate('customer', 'name phone nationalIdNumber')
    .populate('inventoryItem', 'sku name imei1 status')
    .sort({ createdAt: -1 })
    .limit(300)
  res.json({ pawns })
}))

router.post('/pawns', requireAuth, asyncRoute(async (req, res) => {
  const { customer, itemSnapshot, estimatedValue, pawnPercentage, principal, interestRate, dueDate, identificationVerified, notes } = req.body
  if (!customer || !itemSnapshot?.name || !dueDate) return res.status(400).json({ message: 'Customer, item and due date are required' })

  const percentage = Math.min(50, Math.max(40, Number(pawnPercentage || 45)))
  const maxPrincipal = Number(estimatedValue || 0) * (percentage / 100)
  const requestedPrincipal = Number(principal || maxPrincipal)
  if (requestedPrincipal > maxPrincipal + 0.01) {
    return res.status(400).json({ message: `Principal cannot exceed the ${percentage}% valuation limit` })
  }

  const inventoryItem = await InventoryItem.create({
    sku: makeCode('PWN'), category: 'PHONE', name: itemSnapshot.name,
    brand: itemSnapshot.brand, model: itemSnapshot.model, imei1: itemSnapshot.imei || undefined,
    condition: itemSnapshot.condition || 'GOOD', color: itemSnapshot.color, storage: itemSnapshot.storage,
    quantity: 1, buyPrice: requestedPrincipal, sellPrice: Number(estimatedValue || 0),
    status: 'PAWNED', source: 'CUSTOMER', createdBy: req.user._id,
  })

  const pawn = await Pawn.create({
    pawnNo: makeCode('PW'), customer, inventoryItem: inventoryItem._id, itemSnapshot,
    estimatedValue: Number(estimatedValue || 0), pawnPercentage: percentage,
    principal: requestedPrincipal, interestRate: Number(interestRate || 5), dueDate,
    identificationVerified: Boolean(identificationVerified), notes, createdBy: req.user._id,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'PAWN', entityId: pawn._id, details: { pawnNo: pawn.pawnNo, principal: pawn.principal } })
  res.status(201).json({ pawn: await pawn.populate('customer', 'name phone nationalIdNumber') })
}))

router.post('/pawns/:id/payment', requireAuth, asyncRoute(async (req, res) => {
  const pawn = await Pawn.findById(req.params.id)
  if (!pawn) return res.status(404).json({ message: 'Pawn contract not found' })
  if (!['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status)) return res.status(409).json({ message: 'This pawn contract is closed' })

  pawn.payments.push({
    amount: Number(req.body.amount), type: req.body.type || 'INTEREST',
    paidAt: req.body.paidAt || new Date(), note: req.body.note, receivedBy: req.user._id,
  })
  if (req.body.newDueDate) {
    pawn.dueDate = req.body.newDueDate
    pawn.status = 'RENEWED'
  }
  await pawn.save()
  await writeActivity(req, { action: 'PAYMENT', entity: 'PAWN', entityId: pawn._id, details: req.body })
  res.json({ pawn })
}))

router.post('/pawns/:id/redeem', requireAuth, asyncRoute(async (req, res) => {
  const pawn = await Pawn.findById(req.params.id)
  if (!pawn) return res.status(404).json({ message: 'Pawn contract not found' })
  if (!['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED'].includes(pawn.status)) return res.status(409).json({ message: 'This pawn contract is already closed' })
  pawn.status = 'REDEEMED'
  if (req.body.amount) pawn.payments.push({ amount: Number(req.body.amount), type: 'REDEMPTION', receivedBy: req.user._id })
  await pawn.save()
  if (pawn.inventoryItem) await InventoryItem.findByIdAndUpdate(pawn.inventoryItem, { status: 'ARCHIVED', quantity: 0 })
  await writeActivity(req, { action: 'REDEEM', entity: 'PAWN', entityId: pawn._id })
  res.json({ pawn })
}))

router.post('/pawns/:id/forfeit', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const pawn = await Pawn.findById(req.params.id)
  if (!pawn) return res.status(404).json({ message: 'Pawn contract not found' })
  if (!['OVERDUE', 'DUE_SOON', 'ACTIVE', 'RENEWED'].includes(pawn.status)) return res.status(409).json({ message: 'This pawn cannot be forfeited' })
  pawn.status = 'FORFEITED'
  await pawn.save()
  if (pawn.inventoryItem) {
    await InventoryItem.findByIdAndUpdate(pawn.inventoryItem, {
      status: 'IN_STOCK', source: 'PAWN_FORFEIT', quantity: 1,
      buyPrice: pawn.principal, sellPrice: Number(req.body.sellPrice || pawn.estimatedValue),
    })
  }
  await writeActivity(req, { action: 'FORFEIT', entity: 'PAWN', entityId: pawn._id })
  res.json({ pawn })
}))

async function createMultiDevicePurchase(req, res) {
  const {
    sellerType,
    supplier: supplierId,
    customer: customerId,
    seller = {},
    purchaseDate,
    paymentMethod = 'CASH',
    currency = 'USD',
    exchangeRate,
    amountPaid = 0,
    notes,
    items: purchaseItems,
    devices,
  } = req.body

  const items = Array.isArray(purchaseItems) ? purchaseItems : devices

  if (!['EXISTING_CUSTOMER', 'EXISTING_SUPPLIER', 'WALK_IN', 'NEW_CUSTOMER', 'NEW_SUPPLIER'].includes(sellerType)) {
    throw requestError(400, 'Choose an existing, walk-in, or new customer or supplier')
  }
  if (!Array.isArray(items) || items.length === 0) throw requestError(400, 'Add at least one purchase item')
  if (items.length > 100) throw requestError(400, 'A purchase can contain at most 100 items')
  if (!['USD', 'KHR'].includes(currency)) throw requestError(400, 'Currency must be USD or KHR')
  if (!['CASH', 'BANK', 'CARD', 'OTHER'].includes(paymentMethod)) throw requestError(400, 'Invalid payment method')

  const purchasedAt = purchaseDate ? new Date(purchaseDate) : new Date()
  if (Number.isNaN(purchasedAt.getTime())) throw requestError(400, 'Purchase date is invalid')
  const usdKhrRate = currency === 'KHR' ? Number(exchangeRate || fallbackExchangeRate()) : 1
  if (!Number.isFinite(usdKhrRate) || usdKhrRate <= 0) throw requestError(400, 'A valid exchange rate is required')

  const categories = ['PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER']
  const normalizedItems = items.map((item, index) => {
    const category = categories.includes(item.category) ? item.category : 'PHONE'
    const serialized = category === 'PHONE'
    const imei = clean(item.imei)?.replace(/[\s-]/g, '')
    const brand = clean(item.brand)
    const model = clean(item.model)
    const storage = clean(item.storage)
    const color = clean(item.color)
    const sku = clean(item.sku)?.toUpperCase()
    const quantity = serialized ? 1 : Number(item.quantity)
    const purchasePrice = Number(item.purchasePrice)
    const label = `Item ${index + 1}`
    let name = clean(item.name)

    if (serialized) {
      if (!/^\d{15}$/.test(imei || '')) throw requestError(400, `${label}: IMEI must contain exactly 15 digits`)
      if (!brand || !model || !storage || !color) throw requestError(400, `${label}: brand, model, storage, and color are required`)
      name = `${brand} ${model} ${storage}`
    } else if (category === 'TABLET') {
      if (!brand || !model || !storage || !color) throw requestError(400, `${label}: brand, model, storage, and color are required`)
      name = `${brand} ${model} ${storage}`
    } else if (category === 'ACCESSORY') {
      if (!name || !brand || !sku) throw requestError(400, `${label}: item name, brand, and SKU are required`)
    } else if (category === 'SPARE_PART') {
      if (!name) throw requestError(400, `${label}: part name is required`)
      if (!clean(item.compatibleModels)) throw requestError(400, `${label}: compatible models are required`)
      if (!clean(item.oemQuality)) throw requestError(400, `${label}: OEM quality is required`)
    } else if (!name) {
      throw requestError(400, `${label}: item name is required`)
    }
    if (!serialized && (!Number.isInteger(quantity) || quantity < 1)) throw requestError(400, `${label}: quantity must be a whole number greater than zero`)
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw requestError(400, `${label}: unit purchase price is invalid`)
    const batteryHealth = item.batteryHealth === '' || item.batteryHealth === undefined ? undefined : Number(item.batteryHealth)
    if (batteryHealth !== undefined && (!Number.isFinite(batteryHealth) || batteryHealth < 0 || batteryHealth > 100)) {
      throw requestError(400, `${label}: battery health must be between 0 and 100`)
    }
    const accessories = Array.isArray(item.accessoriesIncluded)
      ? item.accessoriesIncluded.filter((value) => ['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].includes(value))
      : []
    return {
      category, name, sku, quantity, imei, brand, model, storage, color, purchasePrice, batteryHealth,
      ram: clean(item.ram),
      condition: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED'].includes(item.condition) ? item.condition : 'GOOD',
      carrierLock: ['UNLOCKED', 'LOCKED', 'UNKNOWN'].includes(item.carrierLock) ? item.carrierLock : 'UNKNOWN',
      compatibleModels: clean(item.compatibleModels)?.split(',').map((value) => value.trim()).filter(Boolean) || [],
      oemQuality: clean(item.oemQuality),
      accessoriesIncluded: accessories,
      notes: clean(item.notes),
    }
  })

  const phones = normalizedItems.filter((item) => item.category === 'PHONE')
  const duplicateImei = phones.find((phone, index) => phones.findIndex((item) => item.imei === phone.imei) !== index)
  if (duplicateImei) throw requestError(409, `IMEI ${duplicateImei.imei} appears more than once in this purchase`)
  if (phones.length) {
    const existingImei = await InventoryItem.findOne({ imei1: { $in: phones.map((phone) => phone.imei) } }).select('imei1')
    if (existingImei) throw requestError(409, `IMEI ${existingImei.imei1} already exists in inventory`)
  }
  const suppliedSkus = normalizedItems.map((item) => item.sku).filter(Boolean)
  if (new Set(suppliedSkus).size !== suppliedSkus.length) throw requestError(409, 'The same SKU appears more than once in this purchase')
  if (suppliedSkus.length) {
    const existingSku = await InventoryItem.findOne({ sku: { $in: suppliedSkus } }).select('sku')
    if (existingSku) throw requestError(409, `SKU ${existingSku.sku} already exists in inventory`)
  }

  const transactionTotal = normalizedItems.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0)
  const transactionPaid = Number(amountPaid || 0)
  if (!Number.isFinite(transactionPaid) || transactionPaid < 0) throw requestError(400, 'Amount paid is invalid')
  if (transactionPaid > transactionTotal + 0.000001) throw requestError(400, 'Amount paid cannot exceed the total amount')
  const transactionBalance = Math.max(0, transactionTotal - transactionPaid)
  const toUsd = (amount) => currency === 'KHR' ? amount / usdKhrRate : amount

  const session = await mongoose.startSession()
  let trade
  try {
    await session.withTransaction(async () => {
      let supplier
      let customer
      let sellerSnapshot
      if (sellerType === 'EXISTING_SUPPLIER') {
        if (!supplierId) throw requestError(400, 'Select an existing supplier')
        supplier = await Supplier.findById(supplierId).session(session)
        if (!supplier || !supplier.active) throw requestError(404, 'Supplier was not found')
        sellerSnapshot = { name: supplier.name, phone: supplier.phone, nationalIdNumber: supplier.nationalIdNumber }
      } else if (sellerType === 'EXISTING_CUSTOMER') {
        if (!customerId) throw requestError(400, 'Select an existing customer')
        customer = await Customer.findById(customerId).session(session)
        if (!customer) throw requestError(404, 'Customer was not found')
        sellerSnapshot = { name: customer.name, phone: customer.phone, nationalIdNumber: customer.nationalIdNumber }
      } else {
        const sellerName = clean(seller.name)
        if (!sellerName) throw requestError(400, 'Seller name is required')
        sellerSnapshot = { name: sellerName, phone: clean(seller.phone), nationalIdNumber: clean(seller.nationalIdNumber) }
        if (sellerType === 'NEW_SUPPLIER') {
          ;[supplier] = await Supplier.create([{
            ...sellerSnapshot,
            createdBy: req.user._id,
          }], { session })
        } else if (sellerType === 'NEW_CUSTOMER') {
          if (!sellerSnapshot.phone) throw requestError(400, 'A phone number is required for a new customer')
          ;[customer] = await Customer.create([{
            name: sellerSnapshot.name,
            phone: sellerSnapshot.phone,
            nationalIdNumber: sellerSnapshot.nationalIdNumber,
            notes: clean(notes),
            createdBy: req.user._id,
          }], { session })
        }
      }

      const source = sellerType.endsWith('SUPPLIER') ? 'SUPPLIER' : 'CUSTOMER'
      const inventoryDocuments = normalizedItems.map((item) => ({
        sku: item.sku || makeCode('BUY'),
        barcode: makeCode('PF'),
        category: item.category,
        name: item.name,
        brand: item.brand,
        model: item.model,
        imei1: item.category === 'PHONE' ? item.imei : undefined,
        storage: item.storage,
        ram: item.ram,
        color: item.color,
        condition: item.condition,
        batteryHealth: item.category === 'PHONE' ? item.batteryHealth : undefined,
        carrierLock: item.category === 'PHONE' ? item.carrierLock : 'UNKNOWN',
        accessoriesIncluded: item.category === 'PHONE' ? item.accessoriesIncluded : [],
        compatibleModels: item.compatibleModels,
        oemQuality: item.oemQuality,
        quantity: item.quantity,
        reorderLevel: item.category === 'PHONE' ? 0 : 2,
        buyPrice: toUsd(item.purchasePrice),
        sellPrice: 0,
        minimumSellPrice: 0,
        status: 'IN_STOCK',
        source,
        notes: item.notes,
        createdBy: req.user._id,
      }))
      const inventoryItems = await InventoryItem.create(inventoryDocuments, { session })
      const tradeLines = inventoryItems.map((item, index) => ({
        inventoryItem: item._id,
        name: item.name,
        quantity: normalizedItems[index].quantity,
        unitPrice: toUsd(normalizedItems[index].purchasePrice),
        costPrice: toUsd(normalizedItems[index].purchasePrice),
        originalUnitPrice: normalizedItems[index].purchasePrice,
        currency,
      }))
      ;[trade] = await Trade.create([{
        tradeNo: makeCode('BY'),
        type: 'BUY',
        customer: customer?._id,
        supplier: supplier?._id,
        sellerType,
        sellerSnapshot,
        purchaseDate: purchasedAt,
        currency,
        exchangeRate: usdKhrRate,
        transactionSubtotal: transactionTotal,
        transactionTotal,
        transactionAmountPaid: transactionPaid,
        transactionBalance,
        paymentStatus: paymentState(transactionTotal, transactionPaid),
        purchaseWorkflowVersion: 3,
        items: tradeLines,
        subtotal: toUsd(transactionTotal),
        discount: 0,
        total: toUsd(transactionTotal),
        amountPaid: toUsd(transactionPaid),
        balance: toUsd(transactionBalance),
        paymentMethod,
        notes: clean(notes),
        createdBy: req.user._id,
      }], { session })
    })
  } finally {
    await session.endSession()
  }

  await writeActivity(req, {
    action: 'CREATE', entity: 'TRADE', entityId: trade._id,
    details: { tradeNo: trade.tradeNo, type: 'BUY', itemCount: items.length, unitCount: normalizedItems.reduce((sum, item) => sum + item.quantity, 0), currency, total: transactionTotal },
  })
  await trade.populate('supplier', 'name phone nationalIdNumber')
  await trade.populate('customer', 'name phone nationalIdNumber')
  await trade.populate('items.inventoryItem', 'sku barcode name category brand model imei1 storage ram color condition batteryHealth carrierLock accessoriesIncluded compatibleModels oemQuality quantity buyPrice sellPrice status')
  res.status(201).json({ trade })
}

router.get('/trades', requireAuth, asyncRoute(async (req, res) => {
  const filter = req.query.type ? { type: req.query.type } : {}
  const trades = await Trade.find(filter)
    .populate('customer', 'name phone')
    .populate('supplier', 'name phone nationalIdNumber')
    .sort({ createdAt: -1 })
    .limit(300)
  res.json({ trades })
}))

router.post('/trades', requireAuth, asyncRoute(async (req, res) => {
  if (req.body.type === 'BUY' && (Array.isArray(req.body.items) || Array.isArray(req.body.devices))) return createMultiDevicePurchase(req, res)
  const { type, customer, items = [], discount = 0, amountPaid, paymentMethod = 'CASH', notes } = req.body
  if (!['BUY', 'SELL'].includes(type) || items.length === 0) return res.status(400).json({ message: 'Trade type and items are required' })

  const tradeItems = []
  for (const line of items) {
    const quantity = Number(line.quantity || 1)
    if (type === 'SELL') {
      const item = await InventoryItem.findById(line.inventoryItem)
      if (!item || item.status !== 'IN_STOCK' || item.quantity < quantity) {
        return res.status(409).json({ message: `${line.name || 'Item'} does not have enough available stock` })
      }
      item.quantity -= quantity
      if (item.quantity === 0) item.status = item.category === 'PHONE' ? 'SOLD' : 'ARCHIVED'
      await item.save()
      tradeItems.push({ inventoryItem: item._id, name: item.name, quantity, unitPrice: Number(line.unitPrice ?? item.sellPrice), costPrice: item.buyPrice })
    } else {
      let item
      if (line.inventoryItem) {
        item = await InventoryItem.findById(line.inventoryItem)
        if (!item) return res.status(404).json({ message: 'Inventory item not found' })
        item.quantity += quantity
        item.status = 'IN_STOCK'
        await item.save()
      } else {
        item = await InventoryItem.create({
          sku: clean(line.sku || makeCode('BUY')), category: line.category || 'PHONE',
          barcode: clean(line.barcode || makeCode('PF')),
          name: line.name, brand: line.brand, model: line.model, imei1: line.imei1 || undefined,
          condition: line.condition || 'GOOD', quantity, buyPrice: Number(line.unitPrice || 0),
          sellPrice: Number(line.sellPrice || 0), status: 'IN_STOCK', source: 'CUSTOMER', createdBy: req.user._id,
        })
      }
      tradeItems.push({ inventoryItem: item._id, name: item.name, quantity, unitPrice: Number(line.unitPrice || item.buyPrice), costPrice: item.buyPrice })
    }
  }

  const subtotal = tradeItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const total = Math.max(0, subtotal - Number(discount || 0))
  const paid = amountPaid === undefined ? total : Number(amountPaid)
  const trade = await Trade.create({
    tradeNo: makeCode(type === 'SELL' ? 'SL' : 'BY'), type, customer: customer || undefined,
    items: tradeItems, subtotal, discount: Number(discount || 0), total,
    amountPaid: paid, balance: Math.max(0, total - paid), paymentMethod, notes, createdBy: req.user._id,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'TRADE', entityId: trade._id, details: { tradeNo: trade.tradeNo, type, total } })
  await trade.populate('customer', 'name phone')
  await trade.populate('items.inventoryItem', 'sku barcode name category brand model imei1 condition quantity buyPrice sellPrice status')
  res.status(201).json({ trade })
}))

router.get('/activity-logs', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (_req, res) => {
  const logs = await ActivityLog.find().populate('user', 'name email role').sort({ createdAt: -1 }).limit(300)
  res.json({ logs })
}))

export default router
