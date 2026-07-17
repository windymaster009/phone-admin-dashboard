import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { allowRoles, requireAuth, signToken, writeActivity } from './auth.js'
import { ActivityLog, Customer, InventoryItem, Pawn, Trade, User } from './models.js'

const router = Router()

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => (typeof value === 'string' ? value.trim() : value)

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

  user.lastLoginAt = new Date()
  await user.save()
  res.json({ token: signToken(user), user: publicUser(user) })
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
    Trade.find().populate('customer', 'name phone').sort({ createdAt: -1 }).limit(6),
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

router.get('/inventory', requireAuth, asyncRoute(async (req, res) => {
  const q = clean(req.query.q || '')
  const filter = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.status) filter.status = req.query.status
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$quantity', '$reorderLevel'] }
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } }, { brand: { $regex: q, $options: 'i' } },
    { model: { $regex: q, $options: 'i' } }, { sku: { $regex: q, $options: 'i' } },
    { imei1: { $regex: q, $options: 'i' } }, { serialNumber: { $regex: q, $options: 'i' } },
  ]
  const items = await InventoryItem.find(filter).sort({ createdAt: -1 }).limit(500)
  res.json({ items })
}))

router.post('/inventory', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const item = await InventoryItem.create({ ...req.body, sku: clean(req.body.sku || makeCode('STK')), createdBy: req.user._id })
  await writeActivity(req, { action: 'CREATE', entity: 'INVENTORY', entityId: item._id, details: { sku: item.sku } })
  res.status(201).json({ item })
}))

router.patch('/inventory/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const forbidden = ['_id', 'createdAt', 'updatedAt', 'createdBy']
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => !forbidden.includes(key)))
  const item = await InventoryItem.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  if (!item) return res.status(404).json({ message: 'Inventory item not found' })
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

router.get('/trades', requireAuth, asyncRoute(async (req, res) => {
  const filter = req.query.type ? { type: req.query.type } : {}
  const trades = await Trade.find(filter).populate('customer', 'name phone').sort({ createdAt: -1 }).limit(300)
  res.json({ trades })
}))

router.post('/trades', requireAuth, asyncRoute(async (req, res) => {
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
  res.status(201).json({ trade: await trade.populate('customer', 'name phone') })
}))

router.get('/activity-logs', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (_req, res) => {
  const logs = await ActivityLog.find().populate('user', 'name email role').sort({ createdAt: -1 }).limit(300)
  res.json({ logs })
}))

export default router
