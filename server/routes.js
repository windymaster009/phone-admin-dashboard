import { randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import {
  allowRoles,
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  signToken,
  writeActivity,
} from './auth.js'
import {
  checkPaywayTransaction,
  closePaywayTransaction,
  fetchPaywayExchangeRates,
  generateKhqr,
  paywayConfiguration,
  usdKhrFromPayway,
} from './integrations/payway/index.js'
import { ActivityLog, Customer, InventoryItem, Pawn, PaywayIntent, Supplier, Trade, User } from './models.js'
import { Loan } from './loanModels.js'
import { refreshLoanStatuses } from './loanDashboardRoutes.js'
import { preventCustomerDeletionWithDocuments } from './documentGuards.js'
import {
  DAILY_PAWN_FEE_RATE,
  addPawnDays,
  calculateDailyPawnSummary,
  isDailyPawn,
  materializeDailyPawnFee,
  pawnCurrencyCode,
  roundPawnAmount,
  validateMaximumPawnPrincipal,
  validateDailyPawnFeeRate,
  validatePawnTermDays,
} from './pawnFeeService.js'

const router = Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inventoryUploadDir = path.resolve(__dirname, '../uploads/inventory')
const dummyPasswordHash = bcrypt.hashSync('phoneflow-invalid-password', 12)
const overviewTimeZone = 'Asia/Phnom_Penh'
const cambodiaOffsetMs = 7 * 60 * 60 * 1000

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => (typeof value === 'string' ? value.trim() : value)

function cambodiaParts(value = new Date()) {
  const shifted = new Date(new Date(value).getTime() + cambodiaOffsetMs)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  }
}

function cambodiaDate(year, month, day, hour = 0) {
  return new Date(Date.UTC(year, month, day, hour) - cambodiaOffsetMs)
}

function cambodiaStartOfDay(value = new Date()) {
  const { year, month, day } = cambodiaParts(value)
  return cambodiaDate(year, month, day)
}

function addUtcDays(value, days) {
  return new Date(value.getTime() + days * 86_400_000)
}

function parseOverviewDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = cambodiaDate(year, month, day)
  const parts = cambodiaParts(date)
  return parts.year === year && parts.month === month && parts.day === day ? date : null
}

function overviewDateKey(value, granularity) {
  const { year, month, day, hour } = cambodiaParts(value)
  const paddedMonth = String(month + 1).padStart(2, '0')
  if (granularity === 'month') return `${year}-${paddedMonth}`
  const paddedDay = String(day).padStart(2, '0')
  if (granularity === 'hour') return `${year}-${paddedMonth}-${paddedDay}T${String(hour).padStart(2, '0')}`
  return `${year}-${paddedMonth}-${paddedDay}`
}

function overviewBucketLabel(value, granularity) {
  const shifted = new Date(value.getTime() + cambodiaOffsetMs)
  if (granularity === 'hour') {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: 'UTC' }).format(shifted)
  }
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(shifted)
  }
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(shifted)
}

function resolveOverviewPeriod(query) {
  const period = String(query.period || 'this_month').toLowerCase()
  let key = period
  const now = new Date()
  const today = cambodiaStartOfDay(now)
  const tomorrow = addUtcDays(today, 1)
  const { year, month } = cambodiaParts(now)
  let from
  let to
  let label

  switch (period) {
    case 'today':
      from = today
      to = tomorrow
      label = 'Today'
      break
    case 'yesterday':
      from = addUtcDays(today, -1)
      to = today
      label = 'Yesterday'
      break
    case 'last_7_days':
      from = addUtcDays(today, -6)
      to = tomorrow
      label = 'Last 7 Days'
      break
    case 'last_30_days':
      from = addUtcDays(today, -29)
      to = tomorrow
      label = 'Last 30 Days'
      break
    case 'last_month':
      from = cambodiaDate(year, month - 1, 1)
      to = cambodiaDate(year, month, 1)
      label = 'Last Month'
      break
    case 'this_year':
      from = cambodiaDate(year, 0, 1)
      to = tomorrow
      label = 'This Year'
      break
    case 'custom': {
      const customFrom = parseOverviewDate(query.from)
      const customTo = parseOverviewDate(query.to)
      if (!customFrom || !customTo) throw requestError(400, 'Choose a valid From and To date')
      if (customFrom > customTo) throw requestError(400, 'From date must be before or equal to To date')
      from = customFrom
      to = addUtcDays(customTo, 1)
      label = 'Custom Range'
      break
    }
    case 'this_month':
    default:
      key = 'this_month'
      from = cambodiaDate(year, month, 1)
      to = tomorrow
      label = 'This Month'
      break
  }

  const dayCount = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000))
  const granularity = ['today', 'yesterday'].includes(period)
    ? 'hour'
    : period === 'this_year' || dayCount > 92
      ? 'month'
      : 'day'

  return { key, label, from, to, dayCount, granularity }
}

function emptyCurrencyTotals() {
  return { USD: 0, KHR: 0 }
}

function currencyTotals(records, amountField) {
  return records.reduce((totals, record) => {
    const currency = record.currency === 'KHR' ? 'KHR' : 'USD'
    totals[currency] = roundMoney(totals[currency] + Math.max(0, Number(record[amountField]) || 0))
    return totals
  }, emptyCurrencyTotals())
}
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const searchText = (value) => String(value ?? '').trim().slice(0, 80)

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isLoopbackRequest(req) {
  const address = String(req.socket?.remoteAddress || '')
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function isPrivateLanRequest(req) {
  const address = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
  if (isLoopbackRequest(req)) return true
  if (address.startsWith('10.') || address.startsWith('192.168.')) return true
  if (!address.startsWith('172.')) return false
  const second = Number(address.split('.')[1])
  return Number.isFinite(second) && second >= 16 && second <= 31
}

function androidLanAccessEnabled() {
  const configured = String(process.env.ANDROID_LAN_ACCESS || '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(configured)) return true
  return process.env.NODE_ENV !== 'production' && configured !== 'false'
}

function allowTradeWrite(req, res, next) {
  const type = String(req.body?.type || '').toUpperCase()
  const roles = type === 'BUY'
    ? ['OWNER', 'MANAGER', 'STOCK']
    : type === 'SELL'
      ? ['OWNER', 'MANAGER', 'CASHIER']
      : []
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ message: 'You do not have permission to perform this transaction' })
  }
  next()
}

async function authorizedPaywayIntent(req, transactionId) {
  const normalizedId = String(transactionId || '').trim().toUpperCase()
  if (!/^PF[A-Z0-9]{8,32}$/.test(normalizedId)) throw requestError(400, 'PayWay transaction ID is invalid')
  const intent = await PaywayIntent.findOne({ transactionId: normalizedId })
  if (!intent) throw requestError(404, 'Payment request was not found')
  const ownsIntent = intent.createdBy.equals(req.user._id)
  if (!ownsIntent && !['OWNER', 'MANAGER'].includes(req.user.role)) {
    throw requestError(403, 'You do not have permission to access this payment request')
  }
  return intent
}

function normalizeGigabytes(value) {
  const raw = clean(String(value ?? '')).toUpperCase().replace(/\s+/g, '')
  if (!raw) return undefined
  const number = Number(raw.replace(/GB$/, ''))
  return Number.isFinite(number) && number > 0 ? `${number}GB` : undefined
}

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

function decodeImageDataUrl(value) {
  const raw = clean(value)
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(raw || '')
  if (!match) throw requestError(400, 'Upload a JPEG, PNG, or WebP image')
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].replace('image/', '')
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0) throw requestError(400, 'Image file is empty')
  if (buffer.length > 4 * 1024 * 1024) throw requestError(400, 'Image must be 4MB or smaller')
  return { buffer, extension }
}

function makePaywayTransactionId() {
  return `PF${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase()
}

const openPawnStatuses = ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED']
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const roundPawnCurrency = roundPawnAmount
const pawnCurrencyTolerance = (currency) => currency === 'KHR' ? 0 : 0.01

function pawnCurrencyAmount(value, currency, fieldName, allowZero = false) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount <= 0)) {
    throw requestError(400, `${fieldName} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`)
  }
  if (currency === 'KHR' && !Number.isInteger(amount)) {
    throw requestError(400, `${fieldName} must be a whole KHR amount`)
  }
  return roundPawnCurrency(amount, currency)
}

function pawnExchangeRate(currency, value) {
  if (currency !== 'KHR') return 1
  const rate = Number(value || fallbackExchangeRate())
  if (!Number.isFinite(rate) || rate < 1000 || rate > 10000) throw requestError(400, 'A valid USD/KHR exchange rate is required')
  return rate
}

function pawnAmountToUsd(amount, currency, exchangeRate) {
  return roundMoney(currency === 'KHR' ? Number(amount || 0) / exchangeRate : amount)
}

function salePricing(item, role) {
  const unitPrice = roundMoney(item?.sellPrice)
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw requestError(409, `${item?.name || 'The selected item'} does not have a valid selling price`)
  }
  const configuredMinimum = roundMoney(item?.minimumSellPrice)
  const minimumUnitPrice = Number.isFinite(configuredMinimum) && configuredMinimum > 0
    ? configuredMinimum
    : role === 'CASHIER'
      ? unitPrice
      : 0
  if (minimumUnitPrice > unitPrice) {
    throw requestError(409, `${item.name} has an invalid minimum selling price`)
  }
  return { unitPrice, minimumUnitPrice }
}

function saleDiscount(value, subtotal, minimumTotal) {
  const discount = roundMoney(value || 0)
  const maximumDiscount = roundMoney(Math.max(0, subtotal - minimumTotal))
  if (!Number.isFinite(discount) || discount < 0) throw requestError(400, 'Discount is invalid')
  if (discount > maximumDiscount + 0.001) {
    throw requestError(400, `Discount cannot exceed ${maximumDiscount.toFixed(2)} without changing the minimum selling price`)
  }
  return discount
}

async function buildSaleQuote(lines, session, role) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    throw requestError(400, 'Add between 1 and 100 sale items')
  }
  const inventoryIds = lines.map((line) => String(line.inventoryItem || ''))
  if (inventoryIds.some((id) => !mongoose.isValidObjectId(id))) throw requestError(400, 'A sale item is invalid')
  if (new Set(inventoryIds).size !== inventoryIds.length) throw requestError(400, 'Add each inventory item only once per sale')

  const tradeItems = []
  const inventoryUpdates = []
  let subtotal = 0
  let minimumTotal = 0
  for (const line of lines) {
    const quantity = Number(line.quantity || 1)
    if (!Number.isInteger(quantity) || quantity < 1) throw requestError(400, 'Sale quantity must be a whole number greater than zero')
    const query = InventoryItem.findById(line.inventoryItem)
    if (session) query.session(session)
    const item = await query
    if (!item || item.status !== 'IN_STOCK' || item.quantity < quantity) {
      throw requestError(409, `${line.name || 'Item'} does not have enough available stock`)
    }
    const { unitPrice, minimumUnitPrice } = salePricing(item, role)
    if (line.unitPrice !== undefined && Math.abs(Number(line.unitPrice) - unitPrice) > 0.001) {
      throw requestError(409, `${item.name} has a new selling price. Refresh and try again`)
    }
    subtotal = roundMoney(subtotal + quantity * unitPrice)
    minimumTotal = roundMoney(minimumTotal + quantity * minimumUnitPrice)
    inventoryUpdates.push({ item, quantity })
    tradeItems.push({
      inventoryItem: item._id,
      name: item.name,
      quantity,
      unitPrice,
      costPrice: Number(item.buyPrice) || 0,
    })
  }
  return { tradeItems, inventoryUpdates, subtotal, minimumTotal }
}

function calculatePawnOffer(input = {}) {
  const currency = pawnCurrencyCode(input.currency)
  const exchangeRate = pawnExchangeRate(currency, input.exchangeRate)
  const marketPrice = Math.max(0, Number(input.marketPrice) || 0)
  const ageMonths = Math.max(0, Number(input.ageMonths) || 0)
  const condition = String(input.condition || 'good').toLowerCase()
  const batteryHealth = Math.min(100, Math.max(0, Number(input.batteryHealth ?? 100)))
  const lockStatus = String(input.lockStatus || 'unlocked').toLowerCase()
  const accessoryState = String(input.accessoryState || 'complete').toLowerCase()
  const accessoriesIncluded = Array.isArray(input.accessoriesIncluded)
    ? input.accessoriesIncluded.map((accessory) => String(accessory).toUpperCase()).filter((accessory) => ['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].includes(accessory))
    : null
  const repairCost = Math.max(0, Number(input.repairCost) || 0)
  const pawnPercentage = Math.min(50, Math.max(40, Number(input.pawnRate ?? input.pawnPercentage ?? 45)))
  const conditionRates = { new: 0, excellent: 0.05, like_new: 0.05, good: 0.12, fair: 0.22, damaged: 0.4 }
  const accessoryRates = { complete: 0, missing_charger: 0.03, phone_only: 0.05 }
  const ageRate = Math.min(ageMonths * 0.0125, 0.5)
  const conditionRate = conditionRates[condition] ?? 0.12
  const batteryRate = batteryHealth >= 85 ? 0 : batteryHealth >= 80 ? 0.04 : batteryHealth >= 70 ? 0.08 : 0.12
  const essentialAccessories = accessoriesIncluded?.filter((accessory) => ['BOX', 'CHARGER', 'CABLE'].includes(accessory)) || []
  const accessoryRate = accessoriesIncluded
    ? essentialAccessories.length === 0
      ? 0.05
      : !accessoriesIncluded.includes('CHARGER') || !accessoriesIncluded.includes('CABLE')
        ? 0.03
        : !accessoriesIncluded.includes('BOX') ? 0.01 : 0
    : input.missingAccessoriesPercent !== undefined
    ? Math.min(0.2, Math.max(0, Number(input.missingAccessoriesPercent) / 100))
    : accessoryRates[accessoryState] ?? 0
  const carrierLockRate = lockStatus === 'carrier_locked' ? 0.1 : 0
  const eligible = lockStatus !== 'activation_locked'
  const ageDeduction = marketPrice * ageRate
  const conditionDeduction = marketPrice * conditionRate
  const batteryDeduction = marketPrice * batteryRate
  const accessoryDeduction = marketPrice * accessoryRate
  const carrierLockDeduction = marketPrice * carrierLockRate
  const estimatedValue = eligible
    ? Math.max(0, marketPrice - ageDeduction - conditionDeduction - batteryDeduction - accessoryDeduction - carrierLockDeduction - repairCost)
    : 0
  const roundedEstimatedValue = roundPawnCurrency(estimatedValue, currency)

  return {
    eligible,
    currency,
    exchangeRate,
    marketPrice: roundPawnCurrency(marketPrice, currency),
    ageMonths,
    condition,
    batteryHealth,
    lockStatus,
    accessoryState,
    accessoriesIncluded: accessoriesIncluded || undefined,
    repairCost: roundPawnCurrency(repairCost, currency),
    pawnPercentage,
    ageDeduction: roundPawnCurrency(ageDeduction, currency),
    conditionDeduction: roundPawnCurrency(conditionDeduction, currency),
    batteryDeduction: roundPawnCurrency(batteryDeduction, currency),
    accessoryDeduction: roundPawnCurrency(accessoryDeduction, currency),
    carrierLockDeduction: roundPawnCurrency(carrierLockDeduction, currency),
    estimatedValue: roundedEstimatedValue,
    maximumPawn: roundPawnCurrency(roundedEstimatedValue * pawnPercentage / 100, currency),
  }
}

function parsePawnDueDate(value) {
  const raw = clean(String(value || ''))
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T23:59:59.999+07:00`)
    : new Date(raw)
  if (Number.isNaN(date.getTime())) throw requestError(400, 'Due date is invalid')
  return date
}

function pawnGraceEnd(dueDate, days = 3) {
  return new Date(dueDate.getTime() + Math.max(0, Number(days) || 0) * 86_400_000)
}

function pawnFeeSummary(pawn, asOf = new Date()) {
  if (isDailyPawn(pawn)) return calculateDailyPawnSummary(pawn, asOf)
  const currency = pawnCurrencyCode(pawn.currency)
  const remainingPrincipal = roundPawnCurrency(Math.max(0, Number(pawn.remainingPrincipal ?? pawn.principal) || 0), currency)
  const accruedFee = roundPawnCurrency(Math.max(0, Number(pawn.accruedInterest) || 0), currency)
  const otherFees = roundPawnCurrency(Math.max(0, Number(pawn.fees) || 0), currency)
  return {
    feeModel: 'LEGACY_MONTHLY', dailyFeeRate: 0, termDays: 0, accruedDays: 0,
    accruedFee, feeAtDueDate: accruedFee,
    totalAtDueDate: roundPawnCurrency(remainingPrincipal + accruedFee + otherFees, currency),
    redemptionTotal: roundPawnCurrency(remainingPrincipal + accruedFee + otherFees, currency),
    remainingPrincipal,
  }
}

function pawnResponse(pawn, asOf = new Date()) {
  const value = typeof pawn?.toObject === 'function' ? pawn.toObject() : { ...pawn }
  return { ...value, feeSummary: pawnFeeSummary(value, asOf) }
}

function pawnAmountDue(pawn, asOf = new Date()) {
  if (isDailyPawn(pawn)) return pawnFeeSummary(pawn, asOf).redemptionTotal
  return roundPawnCurrency(
    Math.max(0, Number(pawn.remainingPrincipal ?? pawn.principal) || 0)
    + Math.max(0, Number(pawn.accruedInterest) || 0)
    + Math.max(0, Number(pawn.fees) || 0),
    pawnCurrencyCode(pawn.currency),
  )
}

function applyPawnPayment(pawn, rawAmount, { type = 'PRINCIPAL', userId, note, paidAt } = {}) {
  const currency = pawnCurrencyCode(pawn.currency)
  const paymentAt = paidAt ? new Date(paidAt) : new Date()
  if (Number.isNaN(paymentAt.getTime()) || paymentAt > new Date()) throw requestError(400, 'Payment date is invalid')
  materializeDailyPawnFee(pawn, paymentAt)
  const amount = pawnCurrencyAmount(rawAmount, currency, 'Payment amount')
  const outstanding = pawnAmountDue(pawn, paymentAt)
  if (amount > outstanding + pawnCurrencyTolerance(currency)) throw requestError(400, `Payment cannot exceed the outstanding balance of ${outstanding}`)

  let unapplied = amount
  const feesApplied = Math.min(unapplied, Math.max(0, Number(pawn.fees) || 0))
  pawn.fees = roundPawnCurrency((Number(pawn.fees) || 0) - feesApplied, currency)
  unapplied = roundPawnCurrency(unapplied - feesApplied, currency)
  const pawnFeeApplied = isDailyPawn(pawn)
    ? Math.min(unapplied, Math.max(0, Number(pawn.accruedPawnFee) || 0))
    : 0
  if (isDailyPawn(pawn)) {
    pawn.accruedPawnFee = roundPawnCurrency((Number(pawn.accruedPawnFee) || 0) - pawnFeeApplied, currency)
    pawn.pawnFeePaid = roundPawnCurrency((Number(pawn.pawnFeePaid) || 0) + pawnFeeApplied, currency)
    unapplied = roundPawnCurrency(unapplied - pawnFeeApplied, currency)
  }
  const interestApplied = Math.min(unapplied, Math.max(0, Number(pawn.accruedInterest) || 0))
  pawn.accruedInterest = roundPawnCurrency((Number(pawn.accruedInterest) || 0) - interestApplied, currency)
  unapplied = roundPawnCurrency(unapplied - interestApplied, currency)
  const principalApplied = Math.min(unapplied, Math.max(0, Number(pawn.remainingPrincipal ?? pawn.principal) || 0))
  pawn.remainingPrincipal = roundPawnCurrency((Number(pawn.remainingPrincipal ?? pawn.principal) || 0) - principalApplied, currency)
  pawn.amountPaid = roundPawnCurrency((Number(pawn.amountPaid) || 0) + amount, currency)
  const balanceAfter = pawnAmountDue(pawn, paymentAt)
  pawn.payments.push({
    amount, type, feesApplied, pawnFeeApplied, interestApplied, principalApplied, balanceAfter,
    paidAt: paymentAt, note: clean(note), receivedBy: userId,
  })
  return { amount, feesApplied, pawnFeeApplied, interestApplied, principalApplied, balanceAfter }
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
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const open = ['ACTIVE', 'DUE_SOON', 'RENEWED']

  await Pawn.updateMany({ status: { $in: open }, dueDate: { $lt: now } }, { $set: { status: 'OVERDUE' } })
  await Pawn.updateMany(
    { status: { $in: ['ACTIVE', 'RENEWED'] }, dueDate: { $gte: now, $lte: soon } },
    { $set: { status: 'DUE_SOON' } },
  )
  await Pawn.updateMany(
    { status: { $in: ['DUE_SOON', 'RENEWED'] }, dueDate: { $gt: soon } },
    { $set: { status: 'ACTIVE' } },
  )

  const reminders = await Pawn.find({
    status: { $in: ['ACTIVE', 'DUE_SOON', 'RENEWED'] },
    dueDate: { $gte: now, $lte: soon },
  }).populate('customer', 'name')
  for (const pawn of reminders) {
    if (pawn.dueReminderFor && pawn.dueReminderFor.getTime() === pawn.dueDate.getTime()) continue
    const updated = await Pawn.findOneAndUpdate(
      { _id: pawn._id, $or: [{ dueReminderFor: { $exists: false } }, { dueReminderFor: { $ne: pawn.dueDate } }] },
      { $set: { dueReminderFor: pawn.dueDate, dueReminderSentAt: now } },
    )
    if (!updated) continue
    const summary = pawnFeeSummary(pawn, pawn.dueDate)
    try {
      await ActivityLog.create({
        action: 'DUE_REMINDER', entity: 'PAWN', entityId: pawn._id,
        details: {
          pawnNo: pawn.pawnNo, customer: pawn.customer?.name || 'Unknown customer',
          principal: summary.remainingPrincipal, fee: summary.accruedFee,
          total: summary.redemptionTotal, currency: pawn.currency, dueDate: pawn.dueDate,
        },
      })
    } catch (error) {
      console.error(`Unable to create due reminder for ${pawn.pawnNo}:`, error.message)
      await Pawn.updateOne({ _id: pawn._id, dueReminderFor: pawn.dueDate }, { $unset: { dueReminderFor: '', dueReminderSentAt: '' } })
    }
  }
}

router.get('/auth/status', asyncRoute(async (_req, res) => {
  const setupRequired = (await User.estimatedDocumentCount()) === 0
  res.json({ setupRequired })
}))

router.get('/auth/android-lan-session', asyncRoute(async (req, res) => {
  if (!androidLanAccessEnabled() || !isPrivateLanRequest(req)) {
    return res.status(403).json({ message: 'Android LAN access is not allowed from this network' })
  }

  const role = String(process.env.ANDROID_LAN_ROLE || 'OWNER').toUpperCase()
  const roles = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK']
  const preferredRole = roles.includes(role) ? role : 'OWNER'
  const user = await User.findOne({ active: true, role: preferredRole }).sort({ createdAt: 1 })
    || await User.findOne({ active: true }).sort({ createdAt: 1 })

  if (!user) return res.status(409).json({ message: 'Create a PhoneFlow user before using Android LAN access' })

  setSessionCookie(res, signToken(user))
  const redirect = typeof req.query.redirect === 'string' ? req.query.redirect : ''
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(redirect)) {
    return res.redirect(302, redirect)
  }
  res.json({ user: publicUser(user) })
}))

router.post('/auth/bootstrap', asyncRoute(async (req, res) => {
  if ((await User.estimatedDocumentCount()) > 0) {
    return res.status(409).json({ message: 'The owner account has already been created' })
  }

  const configuredToken = String(process.env.AUTH_BOOTSTRAP_TOKEN || '')
  const suppliedToken = String(req.get('x-bootstrap-token') || req.body.setupToken || '')
  const localDevelopmentSetup = process.env.NODE_ENV !== 'production' && isLoopbackRequest(req)
  if (!localDevelopmentSetup && (!configuredToken || !secureEqual(configuredToken, suppliedToken))) {
    return res.status(403).json({ message: 'Owner setup is not authorized on this server' })
  }

  const name = clean(req.body.name)
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''

  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Name, email and a password of at least 8 characters are required' })
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'OWNER',
  })

  setSessionCookie(res, signToken(user))
  res.status(201).json({ user: publicUser(user) })
}))

router.post('/auth/login', asyncRoute(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  const user = email ? await User.findOne({ email }) : null
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash || dummyPasswordHash)

  if (!user || !user.active || !passwordMatches) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const token = signToken(user)
  setSessionCookie(res, token)
  res.json({ user: publicUser(user) })

  // Login history is useful but must never turn valid credentials into a 500.
  void User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
    .catch((error) => console.error(`[request ${req.id || 'unknown'}] Last-login update failed:`, error.message))
}))

router.get('/auth/me', requireAuth, (req, res) => {
  setSessionCookie(res, signToken(req.user))
  res.json({ user: publicUser(req.user) })
})

router.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res)
  res.json({ loggedOut: true })
})

router.get('/users', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (_req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 })
  res.json({ users })
}))

router.post('/users', requireAuth, allowRoles('OWNER'), asyncRoute(async (req, res) => {
  const { name, email, password, role = 'CASHIER' } = req.body
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedRole = String(role || '').toUpperCase()
  if (!name || !normalizedEmail || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Valid name, email and password are required' })
  }
  if (!['OWNER', 'MANAGER', 'CASHIER', 'STOCK'].includes(normalizedRole)) {
    return res.status(400).json({ message: 'Select a valid staff role' })
  }

  const user = await User.create({
    name: clean(name),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
    role: normalizedRole,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'USER', entityId: user._id, details: { role: normalizedRole } })
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
    Pawn.aggregate([
      { $match: { status: { $in: openPawnStatuses } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [
                { $eq: ['$currency', 'KHR'] },
                {
                  $divide: [
                    { $ifNull: ['$remainingPrincipal', '$principal'] },
                    { $cond: [{ $gt: ['$exchangeRate', 0] }, '$exchangeRate', fallbackExchangeRate()] },
                  ],
                },
                { $ifNull: ['$remainingPrincipal', '$principal'] },
              ],
            },
          },
        },
      },
    ]),
    InventoryItem.countDocuments({ category: 'PHONE', status: 'IN_STOCK', quantity: { $gt: 0 } }),
    Pawn.countDocuments({ status: 'OVERDUE' }),
    InventoryItem.countDocuments({ status: 'IN_STOCK', $expr: { $lte: ['$quantity', '$reorderLevel'] } }),
    Customer.estimatedDocumentCount(),
    Pawn.estimatedDocumentCount(),
  ])

  const [recentPawns, recentTrades, inventoryMix, monthPerformance, monthlyPerformance, dailyPerformance] = await Promise.all([
    Pawn.find().populate('customer', 'name phone').sort({ createdAt: -1 }).limit(6),
    Trade.find().populate('customer', 'name phone').populate('supplier', 'name phone').sort({ createdAt: -1 }).limit(6),
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
    recentPawns: recentPawns.map((pawn) => pawnResponse(pawn, now)),
    recentTrades,
    inventoryMix,
    monthPerformance,
    monthlyPerformance,
    dailyPerformance,
  })
}))

router.get('/business-overview', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const period = resolveOverviewPeriod(req.query)
  await Promise.all([refreshPawnStatuses(), refreshLoanStatuses()])

  const overviewTradeDateExpression = {
    $cond: [
      { $eq: ['$type', 'BUY'] },
      { $ifNull: ['$purchaseDate', '$createdAt'] },
      '$createdAt',
    ],
  }
  const completedTradePeriodStages = [
    { $match: { status: 'COMPLETED' } },
    { $addFields: { overviewDate: overviewTradeDateExpression } },
    { $match: { overviewDate: { $gte: period.from, $lt: period.to } } },
  ]
  const saleCogsExpression = {
    $sum: {
      $map: {
        input: { $ifNull: ['$items', []] },
        as: 'item',
        in: {
          $multiply: [
            { $ifNull: ['$$item.quantity', 0] },
            { $ifNull: ['$$item.costPrice', 0] },
          ],
        },
      },
    },
  }
  const bucketFormat = period.granularity === 'hour'
    ? '%Y-%m-%dT%H'
    : period.granularity === 'month'
      ? '%Y-%m'
      : '%Y-%m-%d'

  const [financialRows, chartRows, recentTransactions, pawnRecords, loanRecords, inventoryRecords, recentActivity] = await Promise.all([
    Trade.aggregate([
      ...completedTradePeriodStages,
      { $project: { type: 1, total: { $ifNull: ['$total', 0] }, saleCogs: saleCogsExpression } },
      {
        $group: {
          _id: null,
          salesRevenue: { $sum: { $cond: [{ $eq: ['$type', 'SELL'] }, '$total', 0] } },
          purchases: { $sum: { $cond: [{ $eq: ['$type', 'BUY'] }, '$total', 0] } },
          cogs: { $sum: { $cond: [{ $eq: ['$type', 'SELL'] }, '$saleCogs', 0] } },
        },
      },
    ]),
    Trade.aggregate([
      ...completedTradePeriodStages,
      {
        $project: {
          bucket: { $dateToString: { format: bucketFormat, date: '$overviewDate', timezone: overviewTimeZone } },
          type: 1,
          total: { $ifNull: ['$total', 0] },
          saleCogs: saleCogsExpression,
        },
      },
      {
        $group: {
          _id: '$bucket',
          sales: { $sum: { $cond: [{ $eq: ['$type', 'SELL'] }, '$total', 0] } },
          purchases: { $sum: { $cond: [{ $eq: ['$type', 'BUY'] }, '$total', 0] } },
          cogs: { $sum: { $cond: [{ $eq: ['$type', 'SELL'] }, '$saleCogs', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Trade.find({
      $expr: {
        $and: [
          { $gte: [overviewTradeDateExpression, period.from] },
          { $lt: [overviewTradeDateExpression, period.to] },
        ],
      },
    })
      .populate('customer', 'name phone')
      .populate('supplier', 'name phone')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Pawn.find({ status: { $in: openPawnStatuses } })
      .select('status currency remainingPrincipal principal')
      .lean(),
    Loan.find({ status: { $in: ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'PARTIALLY_PAID'] } })
      .select('status currency remainingBalance')
      .lean(),
    InventoryItem.find({ status: 'IN_STOCK', quantity: { $gt: 0 } })
      .select('sku name category quantity reorderLevel buyPrice sellPrice')
      .lean(),
    ActivityLog.find({ entity: { $in: ['TRADE', 'PAWN', 'LOAN', 'INVENTORY'] } })
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
  ])

  const financialRow = financialRows[0] || {}
  const salesRevenue = roundMoney(financialRow.salesRevenue || 0)
  const purchases = roundMoney(financialRow.purchases || 0)
  const cogs = roundMoney(financialRow.cogs || 0)
  const chartByKey = new Map(chartRows.map((row) => [row._id, row]))
  const chart = []

  if (period.granularity === 'hour') {
    for (let hour = 0; hour < 24; hour += 1) {
      const date = new Date(period.from.getTime() + hour * 3_600_000)
      const key = overviewDateKey(date, 'hour')
      const row = chartByKey.get(key)
      const sales = roundMoney(row?.sales || 0)
      const bucketCogs = roundMoney(row?.cogs || 0)
      chart.push({ key, label: overviewBucketLabel(date, 'hour'), sales, purchases: roundMoney(row?.purchases || 0), grossProfit: roundMoney(sales - bucketCogs) })
    }
  } else if (period.granularity === 'month') {
    const start = cambodiaParts(period.from)
    const end = cambodiaParts(addUtcDays(period.to, -1))
    let cursorYear = start.year
    let cursorMonth = start.month
    while (cursorYear < end.year || (cursorYear === end.year && cursorMonth <= end.month)) {
      const date = cambodiaDate(cursorYear, cursorMonth, 1)
      const key = overviewDateKey(date, 'month')
      const row = chartByKey.get(key)
      const sales = roundMoney(row?.sales || 0)
      const bucketCogs = roundMoney(row?.cogs || 0)
      chart.push({ key, label: overviewBucketLabel(date, 'month'), sales, purchases: roundMoney(row?.purchases || 0), grossProfit: roundMoney(sales - bucketCogs) })
      cursorMonth += 1
      if (cursorMonth > 11) {
        cursorMonth = 0
        cursorYear += 1
      }
    }
  } else {
    for (let index = 0; index < period.dayCount; index += 1) {
      const date = addUtcDays(period.from, index)
      const key = overviewDateKey(date, 'day')
      const row = chartByKey.get(key)
      const sales = roundMoney(row?.sales || 0)
      const bucketCogs = roundMoney(row?.cogs || 0)
      chart.push({ key, label: overviewBucketLabel(date, 'day'), sales, purchases: roundMoney(row?.purchases || 0), grossProfit: roundMoney(sales - bucketCogs) })
    }
  }

  const pawnOutstandingRecords = pawnRecords.map((pawn) => ({
    ...pawn,
    outstanding: pawn.remainingPrincipal ?? pawn.principal,
  }))
  const pawnOutstanding = currencyTotals(pawnOutstandingRecords, 'outstanding')
  const loanOutstanding = currencyTotals(loanRecords, 'remainingBalance')
  const lowStockItems = inventoryRecords
    .filter((item) => Number(item.quantity) <= Number(item.reorderLevel))
    .sort((left, right) => Number(left.quantity) - Number(right.quantity) || left.name.localeCompare(right.name))
  const inventory = inventoryRecords.reduce((summary, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0)
    summary.inStockCount += quantity
    summary.productCount += 1
    if (item.category === 'PHONE') summary.phoneCount += quantity
    if (item.category === 'TABLET') summary.tabletCount += quantity
    if (item.category === 'ACCESSORY') summary.accessoryCount += quantity
    if (item.category === 'SPARE_PART') summary.sparePartCount += quantity
    if (item.category === 'OTHER') summary.otherCount += quantity
    summary.costValue = roundMoney(summary.costValue + quantity * (Number(item.buyPrice) || 0))
    summary.retailValue = roundMoney(summary.retailValue + quantity * (Number(item.sellPrice) || 0))
    return summary
  }, {
    inStockCount: 0,
    productCount: 0,
    phoneCount: 0,
    tabletCount: 0,
    accessoryCount: 0,
    sparePartCount: 0,
    otherCount: 0,
    lowStockCount: lowStockItems.length,
    costValue: 0,
    retailValue: 0,
  })

  res.json({
    period: {
      key: period.key,
      label: period.label,
      from: period.from.toISOString(),
      to: addUtcDays(period.to, -1).toISOString(),
      granularity: period.granularity,
    },
    financial: {
      salesRevenue,
      purchases,
      cogs,
      grossProfit: roundMoney(salesRevenue - cogs),
    },
    pawn: {
      active: pawnRecords.filter((pawn) => ['ACTIVE', 'RENEWED'].includes(pawn.status)).length,
      dueSoon: pawnRecords.filter((pawn) => pawn.status === 'DUE_SOON').length,
      overdue: pawnRecords.filter((pawn) => pawn.status === 'OVERDUE').length,
      outstandingPrincipal: pawnOutstanding,
    },
    loans: {
      active: loanRecords.filter((loan) => ['ACTIVE', 'PARTIALLY_PAID'].includes(loan.status)).length,
      dueSoon: loanRecords.filter((loan) => loan.status === 'DUE_SOON').length,
      overdue: loanRecords.filter((loan) => loan.status === 'OVERDUE').length,
      outstandingBalance: loanOutstanding,
    },
    inventory: {
      ...inventory,
      lowStockItems: lowStockItems.slice(0, 5).map((item) => ({
        _id: item._id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        reorderLevel: item.reorderLevel,
      })),
    },
    chart,
    recentTransactions,
    recentActivity,
  })
}))

router.get('/reports/sales', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const period = resolveOverviewPeriod(req.query)
  const paymentMethod = String(req.query.paymentMethod || 'ALL').toUpperCase()
  const status = String(req.query.status || 'COMPLETED').toUpperCase()
  const staffId = String(req.query.staff || 'ALL')
  const paymentMethods = ['ALL', 'CASH', 'KHQR', 'BANK', 'CARD']
  const statuses = ['COMPLETED', 'RETURNED', 'CANCELLED']

  if (!paymentMethods.includes(paymentMethod)) throw requestError(400, 'Select a valid payment method')
  if (!statuses.includes(status)) throw requestError(400, 'Select a valid sale status')
  if (staffId !== 'ALL' && !mongoose.isValidObjectId(staffId)) throw requestError(400, 'Select a valid staff member')

  const match = {
    type: 'SELL',
    status,
    createdAt: { $gte: period.from, $lt: period.to },
    ...(paymentMethod !== 'ALL' ? { paymentMethod } : {}),
    ...(staffId !== 'ALL' ? { createdBy: new mongoose.Types.ObjectId(staffId) } : {}),
  }
  const saleCogsExpression = {
    $sum: {
      $map: {
        input: { $ifNull: ['$items', []] },
        as: 'item',
        in: {
          $multiply: [
            { $ifNull: ['$$item.quantity', 0] },
            { $ifNull: ['$$item.costPrice', 0] },
          ],
        },
      },
    },
  }
  const itemsSoldExpression = {
    $sum: {
      $map: {
        input: { $ifNull: ['$items', []] },
        as: 'item',
        in: { $ifNull: ['$$item.quantity', 0] },
      },
    },
  }
  const accountingSign = status === 'RETURNED' ? -1 : status === 'CANCELLED' ? 0 : 1
  const bucketFormat = period.granularity === 'hour'
    ? '%Y-%m-%dT%H'
    : period.granularity === 'month'
      ? '%Y-%m'
      : '%Y-%m-%d'

  const [summaryRows, chartRows, transactionDocs, productRows, paymentRows, staff] = await Promise.all([
    Trade.aggregate([
      { $match: match },
      { $project: { total: { $ifNull: ['$total', 0] }, cogs: saleCogsExpression, itemsSold: itemsSoldExpression } },
      {
        $group: {
          _id: null,
          salesRevenue: { $sum: { $multiply: ['$total', accountingSign] } },
          cogs: { $sum: { $multiply: ['$cogs', accountingSign] } },
          itemsSold: { $sum: { $multiply: ['$itemsSold', accountingSign] } },
          transactions: { $sum: 1 },
        },
      },
    ]),
    Trade.aggregate([
      { $match: match },
      {
        $project: {
          bucket: { $dateToString: { format: bucketFormat, date: '$createdAt', timezone: overviewTimeZone } },
          total: { $multiply: [{ $ifNull: ['$total', 0] }, accountingSign] },
          cogs: { $multiply: [saleCogsExpression, accountingSign] },
        },
      },
      { $group: { _id: '$bucket', sales: { $sum: '$total' }, cogs: { $sum: '$cogs' } } },
      { $sort: { _id: 1 } },
    ]),
    Trade.find(match)
      .populate('customer', 'name phone')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    Trade.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $project: {
          name: '$items.name',
          quantity: { $multiply: [{ $ifNull: ['$items.quantity', 0] }, accountingSign] },
          revenue: {
            $multiply: [
              {
                $cond: [
                  { $gt: ['$subtotal', 0] },
                  {
                    $multiply: [
                      { $ifNull: ['$total', 0] },
                      {
                        $divide: [
                          { $multiply: [{ $ifNull: ['$items.quantity', 0] }, { $ifNull: ['$items.unitPrice', 0] }] },
                          '$subtotal',
                        ],
                      },
                    ],
                  },
                  0,
                ],
              },
              accountingSign,
            ],
          },
          cogs: {
            $multiply: [
              { $ifNull: ['$items.quantity', 0] },
              { $ifNull: ['$items.costPrice', 0] },
              accountingSign,
            ],
          },
        },
      },
      { $group: { _id: '$name', quantity: { $sum: '$quantity' }, revenue: { $sum: '$revenue' }, cogs: { $sum: '$cogs' } } },
      { $addFields: { grossProfit: { $subtract: ['$revenue', '$cogs'] } } },
      { $sort: { revenue: -1, quantity: -1 } },
      { $limit: 8 },
    ]),
    Trade.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$paymentMethod',
          amount: { $sum: { $multiply: [{ $ifNull: ['$total', 0] }, accountingSign] } },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    User.find({ role: { $in: ['OWNER', 'MANAGER', 'CASHIER'] } })
      .select('name email role')
      .sort({ name: 1 })
      .lean(),
  ])

  const summaryRow = summaryRows[0] || {}
  const salesRevenue = roundMoney(summaryRow.salesRevenue || 0)
  const cogs = roundMoney(summaryRow.cogs || 0)
  const transactionCount = Number(summaryRow.transactions) || 0
  const chartByKey = new Map(chartRows.map((row) => [row._id, row]))
  const chart = []

  const appendChartPoint = (date) => {
    const key = overviewDateKey(date, period.granularity)
    const row = chartByKey.get(key)
    const sales = roundMoney(row?.sales || 0)
    const bucketCogs = roundMoney(row?.cogs || 0)
    chart.push({ key, label: overviewBucketLabel(date, period.granularity), sales, cogs: bucketCogs, grossProfit: roundMoney(sales - bucketCogs) })
  }

  if (period.granularity === 'hour') {
    for (let hour = 0; hour < 24; hour += 1) appendChartPoint(new Date(period.from.getTime() + hour * 3_600_000))
  } else if (period.granularity === 'month') {
    const start = cambodiaParts(period.from)
    const end = cambodiaParts(addUtcDays(period.to, -1))
    let cursorYear = start.year
    let cursorMonth = start.month
    while (cursorYear < end.year || (cursorYear === end.year && cursorMonth <= end.month)) {
      appendChartPoint(cambodiaDate(cursorYear, cursorMonth, 1))
      cursorMonth += 1
      if (cursorMonth > 11) {
        cursorMonth = 0
        cursorYear += 1
      }
    }
  } else {
    for (let index = 0; index < period.dayCount; index += 1) appendChartPoint(addUtcDays(period.from, index))
  }

  const transactions = transactionDocs.map((trade) => {
    const tradeCogs = roundMoney(trade.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.costPrice) || 0), 0) * accountingSign)
    const reportTotal = roundMoney((Number(trade.total) || 0) * accountingSign)
    return {
      ...trade,
      reportTotal,
      reportCost: tradeCogs,
      reportGrossProfit: roundMoney(reportTotal - tradeCogs),
      reportItems: trade.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) * accountingSign,
    }
  })

  res.json({
    period: {
      key: period.key,
      label: period.label,
      from: period.from.toISOString(),
      to: addUtcDays(period.to, -1).toISOString(),
      granularity: period.granularity,
    },
    filters: { paymentMethod, status, staff: staffId },
    summary: {
      salesRevenue,
      cogs,
      grossProfit: roundMoney(salesRevenue - cogs),
      itemsSold: Number(summaryRow.itemsSold) || 0,
      transactions: transactionCount,
      averageSale: transactionCount > 0 ? roundMoney(salesRevenue / transactionCount) : 0,
    },
    chart,
    transactions,
    products: productRows.map((row) => ({
      name: row._id,
      quantity: Number(row.quantity) || 0,
      revenue: roundMoney(row.revenue || 0),
      cogs: roundMoney(row.cogs || 0),
      grossProfit: roundMoney(row.grossProfit || 0),
    })),
    payments: paymentRows.map((row) => ({
      method: row._id || 'OTHER',
      amount: roundMoney(row.amount || 0),
      transactions: Number(row.transactions) || 0,
    })),
    staff,
    totalRecords: transactionCount,
    limited: transactionCount > 500,
  })
}))

router.get('/reports/purchases', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const period = resolveOverviewPeriod(req.query)
  const paymentMethod = String(req.query.paymentMethod || 'ALL').toUpperCase()
  const paymentStatus = String(req.query.paymentStatus || 'ALL').toUpperCase()
  const status = String(req.query.status || 'COMPLETED').toUpperCase()
  const source = String(req.query.source || 'ALL').toUpperCase()
  const staffId = String(req.query.staff || 'ALL')
  const paymentMethods = ['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER']
  const paymentStatuses = ['ALL', 'PAID', 'PARTIAL', 'UNPAID']
  const statuses = ['ALL', 'COMPLETED', 'RETURNED', 'CANCELLED']
  const sources = ['ALL', 'SUPPLIER', 'CUSTOMER', 'WALK_IN', 'LEGACY']

  if (!paymentMethods.includes(paymentMethod)) throw requestError(400, 'Select a valid payment method')
  if (!paymentStatuses.includes(paymentStatus)) throw requestError(400, 'Select a valid payment status')
  if (!statuses.includes(status)) throw requestError(400, 'Select a valid purchase status')
  if (!sources.includes(source)) throw requestError(400, 'Select a valid purchase source')
  if (staffId !== 'ALL' && !mongoose.isValidObjectId(staffId)) throw requestError(400, 'Select a valid staff member')

  const sourceMatch = source === 'SUPPLIER'
    ? { sellerType: { $in: ['EXISTING_SUPPLIER', 'NEW_SUPPLIER'] } }
    : source === 'CUSTOMER'
      ? { sellerType: { $in: ['EXISTING_CUSTOMER', 'NEW_CUSTOMER'] } }
      : source === 'WALK_IN'
        ? { sellerType: 'WALK_IN' }
        : source === 'LEGACY'
          ? { sellerType: 'LEGACY' }
          : {}
  const match = {
    type: 'BUY',
    $or: [
      { purchaseDate: { $gte: period.from, $lt: period.to } },
      { purchaseDate: null, createdAt: { $gte: period.from, $lt: period.to } },
    ],
    ...(status !== 'ALL' ? { status } : {}),
    ...(paymentMethod !== 'ALL' ? { paymentMethod } : {}),
    ...(paymentStatus !== 'ALL' ? { paymentStatus } : {}),
    ...(staffId !== 'ALL' ? { createdBy: new mongoose.Types.ObjectId(staffId) } : {}),
    ...sourceMatch,
  }
  const accountingSign = {
    $switch: {
      branches: [
        { case: { $eq: ['$status', 'RETURNED'] }, then: -1 },
        { case: { $eq: ['$status', 'CANCELLED'] }, then: 0 },
      ],
      default: 1,
    },
  }
  const itemsPurchasedExpression = {
    $sum: {
      $map: {
        input: { $ifNull: ['$items', []] },
        as: 'item',
        in: { $ifNull: ['$$item.quantity', 0] },
      },
    },
  }
  const sourceExpression = {
    $switch: {
      branches: [
        { case: { $in: ['$sellerType', ['EXISTING_SUPPLIER', 'NEW_SUPPLIER']] }, then: 'SUPPLIER' },
        { case: { $in: ['$sellerType', ['EXISTING_CUSTOMER', 'NEW_CUSTOMER']] }, then: 'CUSTOMER' },
        { case: { $eq: ['$sellerType', 'WALK_IN'] }, then: 'WALK_IN' },
      ],
      default: 'LEGACY',
    },
  }
  const bucketFormat = period.granularity === 'hour'
    ? '%Y-%m-%dT%H'
    : period.granularity === 'month'
      ? '%Y-%m'
      : '%Y-%m-%d'

  const [summaryRows, chartRows, transactionDocs, productRows, paymentRows, sourceRows, staff] = await Promise.all([
    Trade.aggregate([
      { $match: match },
      {
        $project: {
          total: { $multiply: [{ $ifNull: ['$total', 0] }, accountingSign] },
          paid: { $multiply: [{ $ifNull: ['$amountPaid', 0] }, accountingSign] },
          balance: { $multiply: [{ $ifNull: ['$balance', 0] }, accountingSign] },
          items: { $multiply: [itemsPurchasedExpression, accountingSign] },
        },
      },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: '$total' },
          amountPaid: { $sum: '$paid' },
          outstandingBalance: { $sum: '$balance' },
          itemsPurchased: { $sum: '$items' },
          transactions: { $sum: 1 },
        },
      },
    ]),
    Trade.aggregate([
      { $match: match },
      {
        $project: {
          reportDate: { $ifNull: ['$purchaseDate', '$createdAt'] },
          total: { $multiply: [{ $ifNull: ['$total', 0] }, accountingSign] },
          paid: { $multiply: [{ $ifNull: ['$amountPaid', 0] }, accountingSign] },
          balance: { $multiply: [{ $ifNull: ['$balance', 0] }, accountingSign] },
        },
      },
      {
        $project: {
          bucket: { $dateToString: { format: bucketFormat, date: '$reportDate', timezone: overviewTimeZone } },
          total: 1,
          paid: 1,
          balance: 1,
        },
      },
      { $group: { _id: '$bucket', total: { $sum: '$total' }, paid: { $sum: '$paid' }, balance: { $sum: '$balance' } } },
      { $sort: { _id: 1 } },
    ]),
    Trade.find(match)
      .populate('customer', 'name phone')
      .populate('supplier', 'name phone')
      .populate('createdBy', 'name email role')
      .sort({ purchaseDate: -1, createdAt: -1 })
      .limit(500)
      .lean(),
    Trade.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $project: {
          name: '$items.name',
          quantity: { $multiply: [{ $ifNull: ['$items.quantity', 0] }, accountingSign] },
          totalCost: {
            $multiply: [
              { $ifNull: ['$items.quantity', 0] },
              { $ifNull: ['$items.unitPrice', 0] },
              accountingSign,
            ],
          },
        },
      },
      { $group: { _id: '$name', quantity: { $sum: '$quantity' }, totalCost: { $sum: '$totalCost' }, transactions: { $sum: 1 } } },
      { $sort: { totalCost: -1, quantity: -1 } },
      { $limit: 8 },
    ]),
    Trade.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$paymentMethod',
          amount: { $sum: { $multiply: [{ $ifNull: ['$total', 0] }, accountingSign] } },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    Trade.aggregate([
      { $match: match },
      { $project: { source: sourceExpression, total: { $multiply: [{ $ifNull: ['$total', 0] }, accountingSign] } } },
      { $group: { _id: '$source', amount: { $sum: '$total' }, transactions: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    User.find({ role: { $in: ['OWNER', 'MANAGER', 'STOCK'] } })
      .select('name email role')
      .sort({ name: 1 })
      .lean(),
  ])

  const summaryRow = summaryRows[0] || {}
  const totalPurchases = roundMoney(summaryRow.totalPurchases || 0)
  const transactionCount = Number(summaryRow.transactions) || 0
  const chartByKey = new Map(chartRows.map((row) => [row._id, row]))
  const chart = []

  const appendChartPoint = (date) => {
    const key = overviewDateKey(date, period.granularity)
    const row = chartByKey.get(key)
    chart.push({
      key,
      label: overviewBucketLabel(date, period.granularity),
      total: roundMoney(row?.total || 0),
      paid: roundMoney(row?.paid || 0),
      balance: roundMoney(row?.balance || 0),
    })
  }

  if (period.granularity === 'hour') {
    for (let hour = 0; hour < 24; hour += 1) appendChartPoint(new Date(period.from.getTime() + hour * 3_600_000))
  } else if (period.granularity === 'month') {
    const start = cambodiaParts(period.from)
    const end = cambodiaParts(addUtcDays(period.to, -1))
    let cursorYear = start.year
    let cursorMonth = start.month
    while (cursorYear < end.year || (cursorYear === end.year && cursorMonth <= end.month)) {
      appendChartPoint(cambodiaDate(cursorYear, cursorMonth, 1))
      cursorMonth += 1
      if (cursorMonth > 11) {
        cursorMonth = 0
        cursorYear += 1
      }
    }
  } else {
    for (let index = 0; index < period.dayCount; index += 1) appendChartPoint(addUtcDays(period.from, index))
  }

  const transactions = transactionDocs.map((trade) => {
    const sign = trade.status === 'RETURNED' ? -1 : trade.status === 'CANCELLED' ? 0 : 1
    return {
      ...trade,
      reportTotal: roundMoney((Number(trade.total) || 0) * sign),
      reportPaid: roundMoney((Number(trade.amountPaid) || 0) * sign),
      reportBalance: roundMoney((Number(trade.balance) || 0) * sign),
      reportItems: trade.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) * sign,
    }
  })

  res.json({
    period: {
      key: period.key,
      label: period.label,
      from: period.from.toISOString(),
      to: addUtcDays(period.to, -1).toISOString(),
      granularity: period.granularity,
    },
    filters: { paymentMethod, paymentStatus, status, source, staff: staffId },
    summary: {
      totalPurchases,
      amountPaid: roundMoney(summaryRow.amountPaid || 0),
      outstandingBalance: roundMoney(summaryRow.outstandingBalance || 0),
      itemsPurchased: Number(summaryRow.itemsPurchased) || 0,
      transactions: transactionCount,
      averagePurchase: transactionCount > 0 ? roundMoney(totalPurchases / transactionCount) : 0,
    },
    chart,
    transactions,
    products: productRows.map((row) => ({
      name: row._id,
      quantity: Number(row.quantity) || 0,
      totalCost: roundMoney(row.totalCost || 0),
      averageUnitCost: Number(row.quantity) ? roundMoney(row.totalCost / row.quantity) : 0,
      transactions: Number(row.transactions) || 0,
    })),
    payments: paymentRows.map((row) => ({
      method: row._id || 'OTHER',
      amount: roundMoney(row.amount || 0),
      transactions: Number(row.transactions) || 0,
    })),
    sources: sourceRows.map((row) => ({
      source: row._id,
      amount: roundMoney(row.amount || 0),
      transactions: Number(row.transactions) || 0,
    })),
    staff,
    totalRecords: transactionCount,
    limited: transactionCount > 500,
  })
}))

router.get('/customers', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const q = searchText(req.query.q)
  const filter = req.query.includeInactive === 'true' ? {} : { active: { $ne: false } }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i')
    filter.$or = [{ name: pattern }, { phone: pattern }, { nationalIdNumber: pattern }]
  }
  const query = Customer.find(filter).sort({ createdAt: -1 }).limit(250)
  if (req.user.role === 'CASHIER') query.select('name phone active createdAt updatedAt')
  const customers = await query
  res.json({ customers })
}))

router.post('/customers', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const { name, phone, nationalIdNumber, nationalIdFrontUrl, nationalIdBackUrl, address, notes } = req.body
  if (!name || !phone) return res.status(400).json({ message: 'Customer name and phone are required' })
  const canManageIdentity = ['OWNER', 'MANAGER'].includes(req.user.role)

  const customer = await Customer.create({
    name: clean(name),
    phone: clean(phone),
    nationalIdNumber: canManageIdentity ? clean(nationalIdNumber) : undefined,
    nationalIdFrontUrl: canManageIdentity ? clean(nationalIdFrontUrl) : undefined,
    nationalIdBackUrl: canManageIdentity ? clean(nationalIdBackUrl) : undefined,
    address: canManageIdentity ? clean(address) : undefined,
    notes: canManageIdentity ? clean(notes) : undefined,
    createdBy: req.user._id,
  })
  await writeActivity(req, { action: 'CREATE', entity: 'CUSTOMER', entityId: customer._id })
  res.status(201).json({ customer })
}))

router.patch('/customers/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const allowed = req.user.role === 'CASHIER'
    ? ['name', 'phone']
    : ['name', 'phone', 'nationalIdNumber', 'nationalIdFrontUrl', 'nationalIdBackUrl', 'address', 'notes', 'active']
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
  const customer = await Customer.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  if (!customer) return res.status(404).json({ message: 'Customer not found' })
  await writeActivity(req, { action: 'UPDATE', entity: 'CUSTOMER', entityId: customer._id, details: update })
  res.json({ customer })
}))

router.delete('/customers/:id', requireAuth, allowRoles('OWNER', 'MANAGER'), preventCustomerDeletionWithDocuments, asyncRoute(async (req, res) => {
  const [pawnExists, tradeExists] = await Promise.all([
    Pawn.exists({ customer: req.params.id }),
    Trade.exists({ customer: req.params.id }),
  ])
  if (pawnExists || tradeExists) {
    return res.status(409).json({ message: 'This customer is linked to transaction history. Deactivate them instead.' })
  }
  const customer = await Customer.findByIdAndDelete(req.params.id)
  if (!customer) return res.status(404).json({ message: 'Customer not found' })
  await writeActivity(req, {
    action: 'DELETE',
    entity: 'CUSTOMER',
    entityId: customer._id,
    details: { name: customer.name },
  })
  res.json({ message: 'Customer deleted' })
}))

router.get('/suppliers', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const q = searchText(req.query.q)
  const filter = req.query.includeInactive === 'true' ? {} : { active: { $ne: false } }
  if (q) filter.$or = [
    { name: { $regex: escapeRegex(q), $options: 'i' } },
    { phone: { $regex: escapeRegex(q), $options: 'i' } },
    { nationalIdNumber: { $regex: escapeRegex(q), $options: 'i' } },
  ]
  const suppliers = await Supplier.find(filter).sort({ name: 1 }).limit(250)
  res.json({ suppliers })
}))

router.post('/suppliers', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
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

router.delete('/suppliers/:id', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const supplier = await Supplier.findByIdAndDelete(req.params.id)
  if (!supplier) return res.status(404).json({ message: 'Supplier not found' })
  await writeActivity(req, {
    action: 'DELETE',
    entity: 'SUPPLIER',
    entityId: supplier._id,
    details: { name: supplier.name },
  })
  res.json({ message: 'Supplier deleted' })
}))

router.get('/inventory', requireAuth, asyncRoute(async (req, res) => {
  const q = searchText(req.query.q)
  const filter = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.status) filter.status = req.query.status
  if (req.query.lowStock === 'true') filter.$expr = { $lte: ['$quantity', '$reorderLevel'] }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i')
    filter.$or = [
      { name: pattern }, { brand: pattern }, { model: pattern }, { sku: pattern },
      { barcode: pattern }, { imei1: pattern }, { serialNumber: pattern },
    ]
  }
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
  const category = clean(req.body.category)?.toUpperCase()
  const storage = normalizeGigabytes(req.body.storage)
  const ram = normalizeGigabytes(req.body.ram)
  const { imageData: rawImageData, ...body } = req.body
  if (['PHONE', 'TABLET'].includes(category) && !storage) {
    return res.status(400).json({ message: 'Storage must be a positive GB value' })
  }
  if (clean(req.body.ram) && !ram) {
    return res.status(400).json({ message: 'RAM must be a positive GB value' })
  }
  const item = await InventoryItem.create({
    ...body,
    category,
    storage,
    ram,
    imageUrl: clean(req.body.imageUrl),
    sku: clean(req.body.sku || makeCode('STK')),
    barcode: clean(req.body.barcode || makeCode('PF')),
    createdBy: req.user._id,
  })
  if (rawImageData) {
    const { buffer, extension } = decodeImageDataUrl(rawImageData)
    await fs.mkdir(inventoryUploadDir, { recursive: true })
    const filename = `${item._id}-${randomUUID()}.${extension}`
    await fs.writeFile(path.join(inventoryUploadDir, filename), buffer)
    item.imageUrl = `/uploads/inventory/${filename}`
    await item.save()
  }
  await writeActivity(req, { action: 'CREATE', entity: 'INVENTORY', entityId: item._id, details: { sku: item.sku } })
  res.status(201).json({ item })
}))

router.patch('/inventory/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const allowed = ['sellPrice', 'minimumSellPrice']
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)))
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: 'Use the stock adjustment, photo, purchase, sale, or pawn workflow for this change' })
  }
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

router.post('/inventory/:id/adjust', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const mode = clean(req.body.mode)?.toUpperCase()
  const reason = clean(req.body.reason)?.toUpperCase()
  const notes = clean(req.body.notes || '')
  const allowedReasons = ['COUNT_CORRECTION', 'DAMAGED', 'LOST', 'RETURNED', 'FOUND', 'OPENING_BALANCE', 'OTHER']

  if (!allowedReasons.includes(reason)) throw requestError(400, 'Select a valid adjustment reason')
  if (notes.length > 500) throw requestError(400, 'Adjustment note must be 500 characters or fewer')

  const current = await InventoryItem.findById(req.params.id)
  if (!current) throw requestError(404, 'Inventory item not found')

  const previousQuantity = current.quantity
  const previousStatus = current.status
  let nextQuantity = previousQuantity
  let nextStatus = previousStatus

  if (current.category === 'PHONE') {
    const requestedStatus = clean(req.body.status)?.toUpperCase()
    if (mode !== 'STATUS' || !['IN_STOCK', 'REPAIR', 'ARCHIVED'].includes(requestedStatus)) {
      throw requestError(400, 'Choose an available, repair, or archived status for this phone')
    }
    if (['PAWNED', 'RESERVED', 'SOLD'].includes(previousStatus)) {
      throw requestError(409, `A ${previousStatus.toLowerCase()} phone must be updated through its related transaction`)
    }
    if (requestedStatus === previousStatus) throw requestError(400, 'Choose a status different from the current status')
    nextStatus = requestedStatus
    nextQuantity = 1
  } else {
    if (!['ADD', 'REMOVE', 'SET'].includes(mode)) throw requestError(400, 'Choose add, remove, or set count')
    if (['PAWNED', 'RESERVED'].includes(previousStatus)) {
      throw requestError(409, `Reserved or pawned stock must be updated through its related transaction`)
    }

    const quantity = Number(req.body.quantity)
    const minimum = mode === 'SET' ? 0 : 1
    if (!Number.isInteger(quantity) || quantity < minimum || quantity > 1_000_000) {
      throw requestError(400, mode === 'SET' ? 'Count must be a whole number from 0 to 1,000,000' : 'Quantity must be a whole number from 1 to 1,000,000')
    }

    if (mode === 'ADD') nextQuantity = previousQuantity + quantity
    if (mode === 'REMOVE') nextQuantity = previousQuantity - quantity
    if (mode === 'SET') nextQuantity = quantity
    if (nextQuantity < 0) throw requestError(400, 'The adjustment cannot reduce stock below zero')
    if (nextQuantity === previousQuantity) throw requestError(400, 'The adjustment does not change the current quantity')
    nextStatus = nextQuantity === 0 ? 'ARCHIVED' : 'IN_STOCK'
  }

  const item = await InventoryItem.findOneAndUpdate(
    { _id: current._id, quantity: previousQuantity, status: previousStatus },
    { quantity: nextQuantity, status: nextStatus },
    { new: true, runValidators: true },
  )
  if (!item) throw requestError(409, 'Inventory changed while you were editing. Refresh and try again')

  await writeActivity(req, {
    action: 'ADJUST',
    entity: 'INVENTORY',
    entityId: item._id,
    details: {
      mode,
      reason,
      notes: notes || undefined,
      previousQuantity,
      quantity: nextQuantity,
      previousStatus,
      status: nextStatus,
      sku: item.sku,
    },
  })
  res.json({ item })
}))

router.post('/inventory/:id/photo', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const current = await InventoryItem.findById(req.params.id)
  if (!current) return res.status(404).json({ message: 'Inventory item not found' })

  const { buffer, extension } = decodeImageDataUrl(req.body.imageData)
  await fs.mkdir(inventoryUploadDir, { recursive: true })
  const filename = `${current._id}-${randomUUID()}.${extension}`
  const filepath = path.join(inventoryUploadDir, filename)
  await fs.writeFile(filepath, buffer)

  const imageUrl = `/uploads/inventory/${filename}`
  const item = await InventoryItem.findByIdAndUpdate(current._id, { imageUrl }, { new: true, runValidators: true })
  await writeActivity(req, { action: 'UPDATE', entity: 'INVENTORY', entityId: item._id, details: { imageUrl } })
  res.json({ item })
}))

router.delete('/inventory/:id/photo', requireAuth, allowRoles('OWNER', 'MANAGER', 'STOCK'), asyncRoute(async (req, res) => {
  const item = await InventoryItem.findByIdAndUpdate(req.params.id, { $unset: { imageUrl: '' } }, { new: true, runValidators: true })
  if (!item) return res.status(404).json({ message: 'Inventory item not found' })
  await writeActivity(req, { action: 'UPDATE', entity: 'INVENTORY', entityId: item._id, details: { imageUrl: null } })
  res.json({ item })
}))

router.post('/valuation/calculate', requireAuth, (req, res) => {
  res.json(calculatePawnOffer(req.body))
})

router.get('/exchange-rates', requireAuth, asyncRoute(async (_req, res) => {
  if (exchangeRateCache && Date.now() - exchangeRateCache.cachedAt < EXCHANGE_RATE_CACHE_MS) {
    return res.json(exchangeRateCache.payload)
  }

  const fallbackRate = fallbackExchangeRate()
  const payway = paywayConfiguration()

  try {
    const payload = await fetchPaywayExchangeRates()
    const rate = usdKhrFromPayway(payload, payway.exchangeRateSide)

    const result = {
      ...rate,
      source: 'ABA PayWay',
      rateType: 'bank',
      configured: true,
      environment: payway.environment,
      updatedAt: new Date().toISOString(),
    }
    exchangeRateCache = { payload: result, cachedAt: Date.now() }
    return res.json(result)
  } catch (error) {
    if (payway.enabled) console.error('ABA PayWay exchange-rate request failed:', error.message)
    return res.json({
      usdKhr: fallbackRate,
      source: 'ABA configured fallback',
      rateType: 'fallback',
      configured: payway.configured,
      environment: payway.environment,
      updatedAt: new Date().toISOString(),
      warning: payway.enabled
        ? 'ABA PayWay live exchange rate is temporarily unavailable'
        : 'ABA PayWay is disabled; using the configured fallback rate',
    })
  }
}))

router.get('/pawns', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  await refreshPawnStatuses()
  const filter = req.query.status ? { status: req.query.status } : {}
  const customerFields = req.user.role === 'CASHIER' ? 'name phone' : 'name phone nationalIdNumber'
  const pawns = await Pawn.find(filter)
    .populate('customer', customerFields)
    .populate('inventoryItem', 'sku name imei1 status')
    .populate('renewals.renewedBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(300)
  const asOf = new Date()
  res.json({ pawns: pawns.map((pawn) => pawnResponse(pawn, asOf)) })
}))

router.post('/pawns', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const { customer, customerDetails, itemSnapshot, estimatedValue, pawnPercentage, principal, termDays, dailyFeeRate, identificationVerified, ownershipConfirmed, notes, valuationSnapshot } = req.body
  if ((!customer && !customerDetails) || !itemSnapshot?.name) return res.status(400).json({ message: 'Customer and item are required' })

  let existingCustomer
  if (customer) {
    existingCustomer = await Customer.findById(customer).select('nationalIdNumber')
    if (!existingCustomer) throw requestError(404, 'Customer not found')
  } else {
    if (!clean(customerDetails?.name)) throw requestError(400, 'New customer name is required')
    if (!clean(customerDetails?.phone)) throw requestError(400, 'New customer phone number is required')
  }
  const nationalIdNumber = clean(existingCustomer?.nationalIdNumber || customerDetails?.nationalIdNumber)
  const confirmedOwnership = Boolean(ownershipConfirmed || (nationalIdNumber && identificationVerified))
  if (!confirmedOwnership) throw requestError(400, 'Confirm the customer identity and phone ownership before releasing pawn money')
  const nationalIdVerified = Boolean(nationalIdNumber && identificationVerified)
  const importedFromCalculator = valuationSnapshot?.source === 'CALCULATOR'
  const verifiedOffer = importedFromCalculator ? calculatePawnOffer(valuationSnapshot) : null
  if (verifiedOffer && !verifiedOffer.eligible) throw requestError(400, 'Activation-locked phones cannot be accepted as pawn collateral')
  const rawCurrency = String(req.body.currency || 'USD').toUpperCase()
  if (!['USD', 'KHR'].includes(rawCurrency)) throw requestError(400, 'Currency must be USD or KHR')
  const requestedCurrency = pawnCurrencyCode(rawCurrency)
  const currency = verifiedOffer?.currency || requestedCurrency
  if (verifiedOffer && requestedCurrency !== currency) throw requestError(400, 'Contract currency must match the imported calculator offer')
  const usdKhrRate = pawnExchangeRate(currency, verifiedOffer?.exchangeRate || req.body.exchangeRate)
  const percentage = verifiedOffer?.pawnPercentage ?? Math.min(50, Math.max(40, Number(pawnPercentage || 45)))
  const valuation = verifiedOffer?.estimatedValue ?? pawnCurrencyAmount(estimatedValue, currency, 'Estimated value')
  const maxPrincipal = verifiedOffer?.maximumPawn ?? roundPawnCurrency(valuation * (percentage / 100), currency)
  const requestedPrincipal = pawnCurrencyAmount(principal, currency, 'Principal')
  const selectedTermDays = validatePawnTermDays(termDays)
  const selectedDailyFeeRate = validateDailyPawnFeeRate(dailyFeeRate === undefined ? DAILY_PAWN_FEE_RATE : dailyFeeRate)
  const startDate = new Date()
  const maturityDate = addPawnDays(startDate, selectedTermDays)
  if (!/^\d{15}$/.test(clean(itemSnapshot.imei) || '')) throw requestError(400, 'IMEI must contain exactly 15 digits')
  try {
    validateMaximumPawnPrincipal(requestedPrincipal, maxPrincipal, currency)
  } catch {
    return res.status(400).json({ message: `Principal cannot exceed the ${percentage}% valuation limit` })
  }

  const gracePeriodDays = 3
  let pawn
  await mongoose.connection.transaction(async (session) => {
    let pawnCustomerId = customer
    if (!pawnCustomerId) {
      const [createdCustomer] = await Customer.create([{
        name: clean(customerDetails.name),
        phone: clean(customerDetails.phone),
        nationalIdNumber,
        address: clean(customerDetails.address),
        notes: 'Created during new pawn registration',
        createdBy: req.user._id,
      }], { session })
      pawnCustomerId = createdCustomer._id
    }
    const [inventoryItem] = await InventoryItem.create([{
      sku: makeCode('PWN'), category: 'PHONE', name: clean(itemSnapshot.name),
      brand: clean(itemSnapshot.brand), model: clean(itemSnapshot.model), imei1: clean(itemSnapshot.imei),
      condition: itemSnapshot.condition || 'GOOD', color: clean(itemSnapshot.color), storage: normalizeGigabytes(itemSnapshot.storage),
      ram: normalizeGigabytes(itemSnapshot.ram), batteryHealth: itemSnapshot.batteryHealth,
      carrierLock: itemSnapshot.carrierLock || 'UNKNOWN',
      accessoriesIncluded: Array.isArray(itemSnapshot.accessoriesIncluded) ? itemSnapshot.accessoriesIncluded : [],
      quantity: 1,
      buyPrice: pawnAmountToUsd(requestedPrincipal, currency, usdKhrRate),
      sellPrice: pawnAmountToUsd(valuation, currency, usdKhrRate),
      status: 'PAWNED', source: 'CUSTOMER', createdBy: req.user._id,
    }], { session })
    const created = await Pawn.create([{
      pawnNo: makeCode('PW'), customer: pawnCustomerId, inventoryItem: inventoryItem._id,
      itemSnapshot: {
        ...itemSnapshot,
        imei: clean(itemSnapshot.imei),
        storage: normalizeGigabytes(itemSnapshot.storage),
        ram: normalizeGigabytes(itemSnapshot.ram),
        accessoriesIncluded: Array.isArray(itemSnapshot.accessoriesIncluded) ? itemSnapshot.accessoriesIncluded : [],
      },
      estimatedValue: valuation, pawnPercentage: percentage, principal: requestedPrincipal,
      valuationSnapshot: verifiedOffer ? {
        source: 'CALCULATOR',
        valuationId: clean(valuationSnapshot.id),
        createdAt: valuationSnapshot.createdAt ? new Date(valuationSnapshot.createdAt) : new Date(),
        ...verifiedOffer,
      } : undefined,
      originalPrincipal: requestedPrincipal, remainingPrincipal: requestedPrincipal,
      interestRate: 0, interestPeriod: 'TERM', accruedInterest: 0,
      feeModel: 'DAILY_SIMPLE', dailyFeeRate: selectedDailyFeeRate, termDays: selectedTermDays,
      startDate, currentTermStartDate: startDate, feeAccrualStartedAt: startDate,
      accruedPawnFee: 0, pawnFeePaid: 0,
      fees: 0, amountPaid: 0, currency, exchangeRate: usdKhrRate,
      issueDate: startDate,
      dueDate: maturityDate, gracePeriodDays, graceEndsAt: pawnGraceEnd(maturityDate, gracePeriodDays),
      identificationVerified: nationalIdVerified,
      ownershipConfirmed: true,
      notes: clean(notes), createdBy: req.user._id, workflowVersion: 4,
    }], { session })
    pawn = created[0]
  })
  await writeActivity(req, { action: 'CREATE', entity: 'PAWN', entityId: pawn._id, details: { pawnNo: pawn.pawnNo, principal: pawn.principal, currency: pawn.currency } })
  await pawn.populate('customer', 'name phone nationalIdNumber')
  await pawn.populate('renewals.renewedBy', 'name role')
  res.status(201).json({ pawn: pawnResponse(pawn) })
}))

router.post('/pawns/:id/payment', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const pawn = await Pawn.findById(req.params.id)
  if (!pawn) return res.status(404).json({ message: 'Pawn contract not found' })
  if (!openPawnStatuses.includes(pawn.status)) return res.status(409).json({ message: 'This pawn contract is closed' })
  const allocation = applyPawnPayment(pawn, req.body.amount, {
    type: 'PRINCIPAL', userId: req.user._id, note: req.body.note, paidAt: req.body.paidAt,
  })
  await pawn.save()
  await writeActivity(req, { action: 'PAYMENT', entity: 'PAWN', entityId: pawn._id, details: { ...allocation, currency: pawn.currency } })
  const customerFields = req.user.role === 'CASHIER' ? 'name phone' : 'name phone nationalIdNumber'
  await pawn.populate('customer', customerFields)
  await pawn.populate('renewals.renewedBy', 'name role')
  res.json({ pawn: pawnResponse(pawn) })
}))

router.post('/pawns/:id/renew', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const pawn = await Pawn.findById(req.params.id)
  if (!pawn) return res.status(404).json({ message: 'Pawn contract not found' })
  if (!openPawnStatuses.includes(pawn.status)) return res.status(409).json({ message: 'This pawn contract is closed' })
  const currency = pawnCurrencyCode(pawn.currency)
  if (isDailyPawn(pawn)) {
    const renewalAt = new Date()
    const selectedTermDays = validatePawnTermDays(req.body.termDays)
    materializeDailyPawnFee(pawn, renewalAt)
    const requiredFeeAndCharges = roundPawnCurrency((Number(pawn.accruedPawnFee) || 0) + (Number(pawn.fees) || 0), currency)
    const paymentAmount = pawnCurrencyAmount(req.body.amount, currency, 'Renewal payment', true)
    if (paymentAmount !== requiredFeeAndCharges) {
      throw requestError(400, `Renewal requires the exact accrued fee and charges of ${requiredFeeAndCharges} ${currency}`)
    }
    const previousDueDate = pawn.dueDate
    const allocation = paymentAmount > 0
      ? applyPawnPayment(pawn, paymentAmount, { type: 'RENEWAL', userId: req.user._id, note: req.body.note, paidAt: renewalAt })
      : { amount: 0, feesApplied: 0, pawnFeeApplied: 0, interestApplied: 0, principalApplied: 0, balanceAfter: pawnAmountDue(pawn, renewalAt) }
    const newDueDate = addPawnDays(renewalAt, selectedTermDays)
    pawn.termDays = selectedTermDays
    pawn.currentTermStartDate = renewalAt
    pawn.feeAccrualStartedAt = renewalAt
    pawn.dueDate = newDueDate
    pawn.graceEndsAt = pawnGraceEnd(newDueDate, pawn.gracePeriodDays)
    pawn.dueReminderFor = undefined
    pawn.dueReminderSentAt = undefined
    pawn.status = 'ACTIVE'
    pawn.renewals.push({
      previousDueDate, newDueDate, paymentAmount, interestCharged: 0,
      feePaid: allocation.pawnFeeApplied + allocation.feesApplied,
      principalRemaining: pawn.remainingPrincipal, termDays: selectedTermDays,
      renewedAt: renewalAt, renewedBy: req.user._id, note: clean(req.body.note),
    })
    if (paymentAmount > 0 && pawn.payments.length) pawn.payments[pawn.payments.length - 1].balanceAfter = pawnAmountDue(pawn, renewalAt)
    await pawn.save()
    await writeActivity(req, { action: 'RENEW', entity: 'PAWN', entityId: pawn._id, details: { ...allocation, pawnNo: pawn.pawnNo, termDays: selectedTermDays, newDueDate, currency } })
    const customerFields = req.user.role === 'CASHIER' ? 'name phone' : 'name phone nationalIdNumber'
    await pawn.populate('customer', customerFields)
    await pawn.populate('renewals.renewedBy', 'name role')
    return res.json({ pawn: pawnResponse(pawn, renewalAt) })
  }

  const newDueDate = parsePawnDueDate(req.body.newDueDate)
  if (newDueDate <= new Date(pawn.dueDate) || newDueDate <= new Date()) {
    throw requestError(400, 'New due date must be later than the current due date')
  }
  const requiredInterestAndFees = roundPawnCurrency((Number(pawn.accruedInterest) || 0) + (Number(pawn.fees) || 0), currency)
  const paymentAmount = pawnCurrencyAmount(req.body.amount, currency, 'Renewal payment', true)
  if (paymentAmount + pawnCurrencyTolerance(currency) < requiredInterestAndFees) {
    throw requestError(400, `Renewal requires at least ${requiredInterestAndFees} ${currency} to clear interest and fees`)
  }
  const previousDueDate = pawn.dueDate
  const allocation = paymentAmount > 0
    ? applyPawnPayment(pawn, paymentAmount, { type: 'RENEWAL', userId: req.user._id, note: req.body.note })
    : { amount: 0, feesApplied: 0, interestApplied: 0, principalApplied: 0, balanceAfter: pawnAmountDue(pawn) }
  const nextInterest = roundPawnCurrency((Number(pawn.remainingPrincipal) || 0) * (Number(pawn.interestRate) || 0) / 100, currency)
  pawn.accruedInterest = nextInterest
  pawn.dueDate = newDueDate
  pawn.graceEndsAt = pawnGraceEnd(newDueDate, pawn.gracePeriodDays)
  pawn.status = 'ACTIVE'
  pawn.renewals.push({
    previousDueDate, newDueDate, paymentAmount, interestCharged: nextInterest,
    renewedBy: req.user._id, note: clean(req.body.note),
  })
  if (paymentAmount > 0 && pawn.payments.length) pawn.payments[pawn.payments.length - 1].balanceAfter = pawnAmountDue(pawn)
  await pawn.save()
  await writeActivity(req, { action: 'RENEW', entity: 'PAWN', entityId: pawn._id, details: { ...allocation, newDueDate, nextInterest, currency } })
  const customerFields = req.user.role === 'CASHIER' ? 'name phone' : 'name phone nationalIdNumber'
  await pawn.populate('customer', customerFields)
  await pawn.populate('renewals.renewedBy', 'name role')
  res.json({ pawn: pawnResponse(pawn) })
}))

router.post('/pawns/:id/redeem', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  let pawn
  let allocation
  await mongoose.connection.transaction(async (session) => {
    pawn = await Pawn.findById(req.params.id).session(session)
    if (!pawn) throw requestError(404, 'Pawn contract not found')
    if (!openPawnStatuses.includes(pawn.status)) throw requestError(409, 'This pawn contract is already closed')
    const currency = pawnCurrencyCode(pawn.currency)
    const redemptionAt = new Date()
    materializeDailyPawnFee(pawn, redemptionAt)
    const outstanding = pawnAmountDue(pawn, redemptionAt)
    const amount = pawnCurrencyAmount(req.body.amount, currency, 'Redemption amount', true)
    if (Math.abs(amount - outstanding) > pawnCurrencyTolerance(currency)) throw requestError(400, `Redemption requires the full outstanding amount of ${outstanding} ${currency}`)
    allocation = outstanding > 0
      ? applyPawnPayment(pawn, amount, { type: 'REDEMPTION', userId: req.user._id, note: req.body.note, paidAt: redemptionAt })
      : { amount: 0, feesApplied: 0, pawnFeeApplied: 0, interestApplied: 0, principalApplied: 0, balanceAfter: 0 }
    pawn.status = 'REDEEMED'
    pawn.redeemedAt = redemptionAt
    await pawn.save({ session })
    if (pawn.inventoryItem) await InventoryItem.findByIdAndUpdate(pawn.inventoryItem, { status: 'ARCHIVED', quantity: 0 }, { session })
  })
  await writeActivity(req, { action: 'REDEEM', entity: 'PAWN', entityId: pawn._id, details: { ...allocation, currency: pawn.currency } })
  const customerFields = req.user.role === 'CASHIER' ? 'name phone' : 'name phone nationalIdNumber'
  await pawn.populate('customer', customerFields)
  await pawn.populate('renewals.renewedBy', 'name role')
  res.json({ pawn: pawnResponse(pawn) })
}))

router.post('/pawns/:id/forfeit', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  await refreshPawnStatuses()
  let pawn
  await mongoose.connection.transaction(async (session) => {
    pawn = await Pawn.findById(req.params.id).session(session)
    if (!pawn) throw requestError(404, 'Pawn contract not found')
    if (pawn.status !== 'OVERDUE') throw requestError(409, 'Only overdue pawn contracts can be forfeited')
    const graceEndsAt = pawn.graceEndsAt || pawnGraceEnd(new Date(pawn.dueDate), pawn.gracePeriodDays)
    if (new Date() <= graceEndsAt) throw requestError(409, `This pawn is still in its grace period until ${graceEndsAt.toISOString()}`)
    pawn.status = 'FORFEITED'
    pawn.forfeitedAt = new Date()
    await pawn.save({ session })
    if (pawn.inventoryItem) {
      const currency = pawnCurrencyCode(pawn.currency)
      const exchangeRate = pawnExchangeRate(currency, pawn.exchangeRate)
      const sellPrice = req.body.sellPrice === undefined || req.body.sellPrice === ''
        ? Number(pawn.estimatedValue) || 0
        : pawnCurrencyAmount(req.body.sellPrice, currency, 'Selling price')
      await InventoryItem.findByIdAndUpdate(pawn.inventoryItem, {
        status: 'IN_STOCK', source: 'PAWN_FORFEIT', quantity: 1,
        buyPrice: pawnAmountToUsd(pawn.originalPrincipal ?? pawn.principal, currency, exchangeRate),
        sellPrice: pawnAmountToUsd(sellPrice, currency, exchangeRate),
      }, { session })
    }
  })
  await writeActivity(req, { action: 'FORFEIT', entity: 'PAWN', entityId: pawn._id })
  res.json({ pawn: pawnResponse(pawn) })
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
    const existingInventoryItem = clean(item.inventoryItem)
    const serialized = category === 'PHONE'
    const imei = clean(item.imei)?.replace(/[\s-]/g, '')
    const brand = clean(item.brand)
    const model = clean(item.model)
    const storage = normalizeGigabytes(item.storage)
    const ram = normalizeGigabytes(item.ram)
    const color = clean(item.color)
    const sku = clean(item.sku)?.toUpperCase()
    const quantity = serialized ? 1 : Number(item.quantity)
    const purchasePrice = Number(item.purchasePrice)
    const label = `Item ${index + 1}`
    let name = clean(item.name)

    if (existingInventoryItem) {
      if (!mongoose.isValidObjectId(existingInventoryItem)) throw requestError(400, `${label}: existing inventory product is invalid`)
      if (!['ACCESSORY', 'SPARE_PART', 'OTHER'].includes(category)) throw requestError(400, `${label}: phones and tablets must be entered as new units`)
    } else if (serialized) {
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
    if (clean(item.ram) && !ram) throw requestError(400, `${label}: RAM must be a positive GB value`)
    const batteryHealth = item.batteryHealth === '' || item.batteryHealth === undefined ? undefined : Number(item.batteryHealth)
    if (batteryHealth !== undefined && (!Number.isFinite(batteryHealth) || batteryHealth < 0 || batteryHealth > 100)) {
      throw requestError(400, `${label}: battery health must be between 0 and 100`)
    }
    const accessories = Array.isArray(item.accessoriesIncluded)
      ? item.accessoriesIncluded.filter((value) => ['BOX', 'CHARGER', 'CABLE', 'CASE', 'EARPHONES'].includes(value))
      : []
    return {
      category, name, sku, quantity, imei, brand, model, storage, color, purchasePrice, batteryHealth, existingInventoryItem,
      ram,
      condition: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED'].includes(item.condition) ? item.condition : 'GOOD',
      carrierLock: ['UNLOCKED', 'LOCKED', 'UNKNOWN'].includes(item.carrierLock) ? item.carrierLock : 'UNKNOWN',
      compatibleModels: clean(item.compatibleModels)?.split(',').map((value) => value.trim()).filter(Boolean) || [],
      oemQuality: clean(item.oemQuality),
      imageUrl: clean(item.imageUrl),
      accessoriesIncluded: accessories,
      notes: clean(item.notes),
    }
  })

  const phones = normalizedItems.filter((item) => item.category === 'PHONE' && !item.existingInventoryItem)
  const duplicateImei = phones.find((phone, index) => phones.findIndex((item) => item.imei === phone.imei) !== index)
  if (duplicateImei) throw requestError(409, `IMEI ${duplicateImei.imei} appears more than once in this purchase`)
  if (phones.length) {
    const existingImei = await InventoryItem.findOne({ imei1: { $in: phones.map((phone) => phone.imei) } }).select('imei1')
    if (existingImei) throw requestError(409, `IMEI ${existingImei.imei1} already exists in inventory`)
  }
  const existingInventoryIds = normalizedItems.map((item) => item.existingInventoryItem).filter(Boolean)
  if (new Set(existingInventoryIds).size !== existingInventoryIds.length) throw requestError(409, 'Add each existing product only once per purchase')
  const suppliedSkus = normalizedItems.filter((item) => !item.existingInventoryItem).map((item) => item.sku).filter(Boolean)
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
      const tradeLines = []
      for (const purchaseItem of normalizedItems) {
        const unitCostUsd = toUsd(purchaseItem.purchasePrice)
        let inventoryItem

        if (purchaseItem.existingInventoryItem) {
          inventoryItem = await InventoryItem.findById(purchaseItem.existingInventoryItem).session(session)
          if (!inventoryItem) throw requestError(404, 'An existing inventory product was not found')
          if (!['ACCESSORY', 'SPARE_PART', 'OTHER'].includes(inventoryItem.category)) {
            throw requestError(400, `${inventoryItem.name}: phones and tablets cannot be restocked as an existing product`)
          }
          if (inventoryItem.category !== purchaseItem.category) {
            throw requestError(409, `${inventoryItem.name}: selected product category no longer matches this purchase item`)
          }
          if (['PAWNED', 'RESERVED'].includes(inventoryItem.status)) {
            throw requestError(409, `${inventoryItem.name}: reserved or pawned stock cannot be restocked`)
          }

          const previousQuantity = Number(inventoryItem.quantity) || 0
          const nextQuantity = previousQuantity + purchaseItem.quantity
          const previousValue = (Number(inventoryItem.buyPrice) || 0) * previousQuantity
          inventoryItem.quantity = nextQuantity
          inventoryItem.buyPrice = (previousValue + unitCostUsd * purchaseItem.quantity) / nextQuantity
          inventoryItem.status = 'IN_STOCK'
          await inventoryItem.save({ session })
        } else {
          ;[inventoryItem] = await InventoryItem.create([{
            sku: purchaseItem.sku || makeCode('BUY'),
            barcode: makeCode('PF'),
            category: purchaseItem.category,
            name: purchaseItem.name,
            brand: purchaseItem.brand,
            model: purchaseItem.model,
            imei1: purchaseItem.category === 'PHONE' ? purchaseItem.imei : undefined,
            storage: purchaseItem.storage,
            ram: purchaseItem.ram,
            color: purchaseItem.color,
            condition: purchaseItem.condition,
            batteryHealth: purchaseItem.category === 'PHONE' ? purchaseItem.batteryHealth : undefined,
            carrierLock: purchaseItem.category === 'PHONE' ? purchaseItem.carrierLock : 'UNKNOWN',
            accessoriesIncluded: purchaseItem.category === 'PHONE' ? purchaseItem.accessoriesIncluded : [],
            compatibleModels: purchaseItem.compatibleModels,
            oemQuality: purchaseItem.oemQuality,
            imageUrl: purchaseItem.imageUrl,
            quantity: purchaseItem.quantity,
            reorderLevel: purchaseItem.category === 'PHONE' ? 0 : 2,
            buyPrice: unitCostUsd,
            sellPrice: 0,
            minimumSellPrice: 0,
            status: 'IN_STOCK',
            source,
            notes: purchaseItem.notes,
            createdBy: req.user._id,
          }], { session })
        }

        tradeLines.push({
          inventoryItem: inventoryItem._id,
          name: inventoryItem.name,
          quantity: purchaseItem.quantity,
          unitPrice: unitCostUsd,
          costPrice: unitCostUsd,
          originalUnitPrice: purchaseItem.purchasePrice,
          currency,
        })
      }
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
        purchaseWorkflowVersion: 4,
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
  const identityFields = ['OWNER', 'MANAGER'].includes(req.user.role) ? 'name phone nationalIdNumber' : 'name phone'
  await trade.populate('supplier', identityFields)
  await trade.populate('customer', identityFields)
  await trade.populate('items.inventoryItem', 'sku barcode name category brand model imei1 storage ram color condition batteryHealth carrierLock accessoriesIncluded compatibleModels oemQuality imageUrl quantity buyPrice sellPrice status')
  res.status(201).json({ trade })
}

router.get('/trades', requireAuth, asyncRoute(async (req, res) => {
  const requestedType = String(req.query.type || '').toUpperCase()
  const filter = req.user.role === 'STOCK'
    ? { type: 'BUY' }
    : req.user.role === 'CASHIER'
      ? { type: 'SELL' }
      : ['BUY', 'SELL'].includes(requestedType)
        ? { type: requestedType }
        : {}
  const supplierFields = ['OWNER', 'MANAGER'].includes(req.user.role) ? 'name phone nationalIdNumber' : 'name phone'
  const trades = await Trade.find(filter)
    .populate('customer', 'name phone')
    .populate('supplier', supplierFields)
    .sort({ createdAt: -1 })
    .limit(300)
  res.json({ trades })
}))

router.get('/payway/config', requireAuth, asyncRoute(async (_req, res) => {
  const config = paywayConfiguration()
  res.json({
    enabled: config.enabled,
    configured: config.configured,
    environment: config.environment,
    qrLifetimeMinutes: config.qrLifetimeMinutes,
  })
}))

router.post('/payway/khqr', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const {
    inventoryItem,
    customer,
    quantity: rawQuantity = 1,
    unitPrice: rawUnitPrice,
    discount: rawDiscount = 0,
  } = req.body
  const item = await InventoryItem.findById(inventoryItem)
  const quantity = item?.category === 'PHONE' ? 1 : Number(rawQuantity)

  if (!item || item.status !== 'IN_STOCK' || item.quantity < quantity) {
    throw requestError(409, 'The selected item is no longer available')
  }
  if (!Number.isInteger(quantity) || quantity < 1) throw requestError(400, 'Quantity must be a whole number greater than zero')
  const { unitPrice, minimumUnitPrice } = salePricing(item, req.user.role)
  if (rawUnitPrice !== undefined && Math.abs(Number(rawUnitPrice) - unitPrice) > 0.001) {
    throw requestError(409, 'The selling price changed. Refresh the product and try again')
  }

  const subtotal = roundMoney(quantity * unitPrice)
  const discount = saleDiscount(rawDiscount, subtotal, roundMoney(quantity * minimumUnitPrice))
  const amount = roundMoney(subtotal - discount)
  if (amount < 0.01) throw requestError(400, 'KHQR total must be at least $0.01')

  if (customer && !mongoose.isValidObjectId(customer)) throw requestError(400, 'Customer is invalid')
  const customerRecord = customer ? await Customer.findOne({ _id: customer, active: { $ne: false } }) : null
  if (customer && !customerRecord) throw requestError(404, 'Customer was not found')
  const names = String(customerRecord?.name || 'Walk-in customer').trim().split(/\s+/)
  const transactionId = makePaywayTransactionId()
  const result = await generateKhqr({
    transactionId,
    amount,
    currency: 'USD',
    customer: {
      firstName: names.shift() || 'Walk-in',
      lastName: names.join(' ') || 'Customer',
      phone: customerRecord?.phone || '',
    },
    items: [{ name: item.name, quantity, price: unitPrice }],
  })
  const config = paywayConfiguration()
  const expiresAt = new Date(Date.now() + config.qrLifetimeMinutes * 60_000)
  await PaywayIntent.create({
    transactionId,
    createdBy: req.user._id,
    inventoryItem: item._id,
    customer: customerRecord?._id,
    quantity,
    unitPrice,
    discount,
    amount,
    currency: 'USD',
    expiresAt,
  })

  res.status(201).json({
    transactionId,
    amount,
    currency: 'USD',
    qrImage: result.qrImage,
    qrString: result.qrString,
    deeplink: result.abapay_deeplink,
    expiresAt: expiresAt.toISOString(),
    environment: config.environment,
  })
}))

router.get('/payway/khqr/:transactionId/status', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const intent = await authorizedPaywayIntent(req, req.params.transactionId)
  if (intent.status === 'COMPLETED') {
    return res.json({ approved: true, paymentStatus: 'APPROVED', amount: intent.amount, currency: intent.currency })
  }
  if (intent.status === 'CANCELLED' || intent.expiresAt <= new Date()) {
    if (intent.status !== 'CANCELLED') await PaywayIntent.updateOne({ _id: intent._id }, { $set: { status: 'EXPIRED' } })
    return res.json({ approved: false, paymentStatus: intent.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED', amount: intent.amount, currency: intent.currency })
  }
  const payload = await checkPaywayTransaction(intent.transactionId)
  const data = payload?.data || {}
  const approved = Number(data.payment_status_code) === 0
    && String(data.payment_status || '').toUpperCase() === 'APPROVED'
  if (approved && intent.status !== 'APPROVED') {
    await PaywayIntent.updateOne({ _id: intent._id, status: 'PENDING' }, { $set: { status: 'APPROVED' } })
  }
  res.json({
    approved,
    paymentStatus: data.payment_status || payload?.status?.message || 'PENDING',
    paymentStatusCode: data.payment_status_code,
    amount: Number(data.original_amount ?? data.total_amount),
    currency: data.original_currency || data.payment_currency,
  })
}))

router.post('/payway/khqr/:transactionId/close', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const intent = await authorizedPaywayIntent(req, req.params.transactionId)
  if (intent.status === 'COMPLETED') throw requestError(409, 'A completed payment request cannot be cancelled')
  await closePaywayTransaction(intent.transactionId)
  await PaywayIntent.updateOne({ _id: intent._id }, { $set: { status: 'CANCELLED' } })
  res.json({ closed: true })
}))

router.post('/trades', requireAuth, allowTradeWrite, asyncRoute(async (req, res) => {
  if (req.body.type === 'BUY' && (Array.isArray(req.body.items) || Array.isArray(req.body.devices))) return createMultiDevicePurchase(req, res)
  const {
    type,
    customer,
    items = [],
    discount = 0,
    amountPaid,
    paymentMethod = 'CASH',
    paywayTransactionId,
    notes,
  } = req.body
  if (type !== 'SELL') throw requestError(400, 'Use the purchase workflow to buy inventory')
  if (!['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'].includes(paymentMethod)) {
    throw requestError(400, 'Invalid payment method')
  }
  if (paymentMethod === 'KHQR' && !paywayTransactionId) throw requestError(400, 'PayWay transaction ID is required')
  if (paywayTransactionId && await Trade.exists({ paywayTransactionId })) {
    throw requestError(409, 'This KHQR payment has already been recorded')
  }
  const initialQuote = await buildSaleQuote(items, undefined, req.user.role)
  const verifiedDiscount = saleDiscount(discount, initialQuote.subtotal, initialQuote.minimumTotal)
  const total = roundMoney(initialQuote.subtotal - verifiedDiscount)
  if (total < 0.01) throw requestError(400, 'Sale total must be at least $0.01')
  let paymentIntent
  if (paymentMethod === 'KHQR') {
    paymentIntent = await authorizedPaywayIntent(req, paywayTransactionId)
    if (paymentIntent.status === 'COMPLETED' || paymentIntent.status === 'CANCELLED' || paymentIntent.expiresAt <= new Date()) {
      throw requestError(409, 'This KHQR payment request is no longer available')
    }
    if (items.length !== 1
      || String(paymentIntent.inventoryItem) !== String(items[0].inventoryItem)
      || Number(paymentIntent.quantity) !== Number(items[0].quantity || 1)
      || Math.abs(Number(paymentIntent.amount) - total) > 0.001) {
      throw requestError(409, 'KHQR payment request does not match this sale')
    }
    const payment = await checkPaywayTransaction(paymentIntent.transactionId)
    const paymentData = payment?.data || {}
    const approved = Number(paymentData.payment_status_code) === 0
      && String(paymentData.payment_status || '').toUpperCase() === 'APPROVED'
    const paidAmount = Number(paymentData.original_amount ?? paymentData.total_amount)
    const paidCurrency = String(paymentData.original_currency || paymentData.payment_currency || '').toUpperCase()
    if (!approved) throw requestError(409, 'KHQR payment has not been approved yet')
    if (paidCurrency !== 'USD' || !Number.isFinite(paidAmount) || Math.abs(paidAmount - total) > 0.001) {
      throw requestError(409, 'KHQR payment amount or currency does not match this sale')
    }
  }
  const paid = paymentMethod === 'KHQR' ? total : amountPaid === undefined ? total : Number(amountPaid)
  if (!Number.isFinite(paid) || paid < 0 || paid > total + 0.001) {
    throw requestError(400, 'Amount paid must be between zero and the sale total')
  }

  const session = await mongoose.startSession()
  let trade
  try {
    await session.withTransaction(async () => {
      if (customer) {
        if (!mongoose.isValidObjectId(customer)) throw requestError(400, 'Customer is invalid')
        const customerExists = await Customer.exists({ _id: customer, active: { $ne: false } }).session(session)
        if (!customerExists) throw requestError(404, 'Customer was not found')
      }
      if (paywayTransactionId && await Trade.exists({ paywayTransactionId }).session(session)) {
        throw requestError(409, 'This KHQR payment has already been recorded')
      }

      const quote = await buildSaleQuote(items, session, req.user.role)
      const currentDiscount = saleDiscount(discount, quote.subtotal, quote.minimumTotal)
      const currentTotal = roundMoney(quote.subtotal - currentDiscount)
      if (Math.abs(currentTotal - total) > 0.001) throw requestError(409, 'Sale pricing changed. Refresh and try again')

      for (const { item, quantity } of quote.inventoryUpdates) {
        item.quantity -= quantity
        if (item.quantity === 0) item.status = item.category === 'PHONE' ? 'SOLD' : 'ARCHIVED'
        await item.save({ session })
      }

      ;[trade] = await Trade.create([{
        tradeNo: makeCode('SL'),
        type: 'SELL',
        customer: customer || undefined,
        items: quote.tradeItems,
        subtotal: quote.subtotal,
        discount: currentDiscount,
        total: currentTotal,
        amountPaid: roundMoney(paid),
        balance: roundMoney(Math.max(0, currentTotal - paid)),
        paymentMethod,
        paywayTransactionId: paywayTransactionId || undefined,
        notes: clean(notes),
        createdBy: req.user._id,
      }], { session })
      if (paymentIntent) {
        const completedIntent = await PaywayIntent.findOneAndUpdate(
          { _id: paymentIntent._id, status: { $in: ['PENDING', 'APPROVED'] } },
          { $set: { status: 'COMPLETED' } },
          { new: true, session },
        )
        if (!completedIntent) throw requestError(409, 'This KHQR payment request was already finalized')
      }
    })
  } finally {
    await session.endSession()
  }
  if (paymentMethod === 'KHQR') {
    await closePaywayTransaction(paywayTransactionId).catch((error) => {
      console.error(`Unable to close completed PayWay transaction ${paywayTransactionId}:`, error.message)
    })
  }
  await writeActivity(req, { action: 'CREATE', entity: 'TRADE', entityId: trade._id, details: { tradeNo: trade.tradeNo, type: 'SELL', total } })
  await trade.populate('customer', 'name phone')
  await trade.populate('items.inventoryItem', 'sku barcode name category brand model imei1 condition quantity buyPrice sellPrice status')
  res.status(201).json({ trade })
}))

router.get('/activity-logs', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (_req, res) => {
  await refreshPawnStatuses()
  const logs = await ActivityLog.find().populate('user', 'name email role').sort({ createdAt: -1 }).limit(300)
  res.json({ logs })
}))

export default router
