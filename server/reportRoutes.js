import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth } from './auth.js'
import { ActivityLog, InventoryItem, Pawn, Trade, User } from './models.js'
import { Loan, LoanPayment } from './loanModels.js'
import { refreshLoanStatuses } from './loanDashboardRoutes.js'
import { ServiceCharge } from './serviceModels.js'
import { convertToUsd, roundMoney } from './reportCurrency.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const reportRoles = ['OWNER', 'MANAGER']
const staffRoles = ['OWNER', 'MANAGER', 'CASHIER', 'STOCK']
const cambodiaOffsetMs = 7 * 60 * 60 * 1000

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function cambodiaParts(value = new Date()) {
  const shifted = new Date(new Date(value).getTime() + cambodiaOffsetMs)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  }
}

function cambodiaDate(year, month, day) {
  return new Date(Date.UTC(year, month, day) - cambodiaOffsetMs)
}

function cambodiaStartOfDay(value = new Date()) {
  const { year, month, day } = cambodiaParts(value)
  return cambodiaDate(year, month, day)
}

function parseDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = cambodiaDate(year, month, day)
  const parts = cambodiaParts(date)
  return parts.year === year && parts.month === month && parts.day === day ? date : null
}

function addDays(value, days) {
  return new Date(value.getTime() + days * 86_400_000)
}

function resolvePeriod(query, defaultPeriod = 'this_month') {
  const key = String(query.period || defaultPeriod).toLowerCase()
  const now = new Date()
  const today = cambodiaStartOfDay(now)
  const tomorrow = addDays(today, 1)
  const { year, month } = cambodiaParts(now)
  let from
  let to = tomorrow
  let label

  if (key === 'all_time') {
    from = new Date(0)
    label = 'All Time'
  } else if (key === 'today') {
    from = today
    label = 'Today'
  } else if (key === 'yesterday') {
    from = addDays(today, -1)
    to = today
    label = 'Yesterday'
  } else if (key === 'last_7_days') {
    from = addDays(today, -6)
    label = 'Last 7 Days'
  } else if (key === 'last_30_days') {
    from = addDays(today, -29)
    label = 'Last 30 Days'
  } else if (key === 'last_month') {
    from = cambodiaDate(year, month - 1, 1)
    to = cambodiaDate(year, month, 1)
    label = 'Last Month'
  } else if (key === 'this_year') {
    from = cambodiaDate(year, 0, 1)
    label = 'This Year'
  } else if (key === 'custom') {
    from = parseDateInput(query.from)
    const customTo = parseDateInput(query.to)
    if (!from || !customTo) throw requestError(400, 'Choose a valid From and To date')
    if (from > customTo) throw requestError(400, 'From date must be before or equal to To date')
    to = addDays(customTo, 1)
    label = 'Custom Range'
  } else {
    from = cambodiaDate(year, month, 1)
    label = 'This Month'
  }

  return { key, label, from, to }
}

function validChoice(value, allowed, label) {
  const normalized = String(value || 'ALL').toUpperCase()
  if (!allowed.includes(normalized)) throw requestError(400, `Select a valid ${label}`)
  return normalized
}

function staffFilter(value) {
  const normalized = String(value || 'ALL')
  if (normalized === 'ALL') return null
  if (!mongoose.isValidObjectId(normalized)) throw requestError(400, 'Select a valid staff member')
  return new mongoose.Types.ObjectId(normalized)
}

async function reportStaff() {
  return User.find({ role: { $in: staffRoles } }).select('name email role').sort({ name: 1 }).lean()
}

async function refreshReportPawnStatuses() {
  const now = new Date()
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  await Pawn.updateMany({ status: { $in: ['ACTIVE', 'DUE_SOON', 'RENEWED'] }, dueDate: { $lt: now } }, { $set: { status: 'OVERDUE' } })
  await Pawn.updateMany({ status: { $in: ['ACTIVE', 'RENEWED'] }, dueDate: { $gte: now, $lte: soon } }, { $set: { status: 'DUE_SOON' } })
  await Pawn.updateMany({ status: { $in: ['DUE_SOON', 'RENEWED'] }, dueDate: { $gt: soon } }, { $set: { status: 'ACTIVE' } })
}

function breakdown(records, getLabel, getValue = () => 1) {
  const totals = new Map()
  for (const record of records) {
    const label = String(getLabel(record) || 'UNKNOWN').toUpperCase()
    const current = totals.get(label) || { label, value: 0, count: 0 }
    current.value = roundMoney(current.value + Number(getValue(record) || 0))
    current.count += 1
    totals.set(label, current)
  }
  return [...totals.values()].sort((a, b) => b.value - a.value || b.count - a.count)
}

function publicStaff(user) {
  return user?.name || 'System'
}

router.get('/inventory', requireAuth, allowRoles(...reportRoles), asyncRoute(async (req, res) => {
  const category = validChoice(req.query.category, ['ALL', 'PHONE', 'TABLET', 'ACCESSORY', 'SPARE_PART', 'OTHER'], 'category')
  const status = validChoice(req.query.status, ['ALL', 'IN_STOCK', 'RESERVED', 'SOLD', 'PAWNED', 'REPAIR', 'ARCHIVED'], 'inventory status')
  const source = validChoice(req.query.source, ['ALL', 'SUPPLIER', 'CUSTOMER', 'PAWN_FORFEIT', 'OTHER'], 'inventory source')
  const stock = validChoice(req.query.stock, ['ALL', 'AVAILABLE', 'LOW', 'OUT'], 'stock level')
  const match = {
    ...(category !== 'ALL' ? { category } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(source !== 'ALL' ? { source } : {}),
  }
  let items = await InventoryItem.find(match).sort({ name: 1, createdAt: -1 }).lean()
  const isLow = (item) => item.status === 'IN_STOCK' && Number(item.quantity || 0) <= Number(item.reorderLevel || 0)
  if (stock === 'AVAILABLE') items = items.filter((item) => item.status === 'IN_STOCK' && Number(item.quantity || 0) > 0)
  if (stock === 'LOW') items = items.filter(isLow)
  if (stock === 'OUT') items = items.filter((item) => Number(item.quantity || 0) <= 0)

  const units = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const costValue = roundMoney(items.reduce((sum, item) => sum + Number(item.buyPrice || 0) * Number(item.quantity || 0), 0))
  const retailValue = roundMoney(items.reduce((sum, item) => sum + Number(item.sellPrice || 0) * Number(item.quantity || 0), 0))
  const lowStock = items.filter(isLow).length
  const categoryRows = breakdown(items, (item) => item.category, (item) => Number(item.quantity || 0))
  const statusRows = breakdown(items, (item) => item.status, (item) => Number(item.quantity || 0))

  res.json({
    title: 'Inventory Report',
    description: 'Current stock quantity, cost value, retail value, and low-stock exposure.',
    meta: { currency: 'USD', totalRecords: items.length, limited: items.length > 500 },
    filters: { category, status, source, stock },
    summary: [
      { label: 'Products', value: items.length, format: 'number', detail: 'Matching stock records', tone: 'violet' },
      { label: 'Stock Units', value: units, format: 'number', detail: 'Units across products', tone: 'blue' },
      { label: 'Cost Value', value: costValue, format: 'currency', detail: 'Quantity × buy price', tone: 'orange' },
      { label: 'Retail Value', value: retailValue, format: 'currency', detail: 'Quantity × sell price', tone: 'blue' },
      { label: 'Potential Margin', value: roundMoney(retailValue - costValue), format: 'currency', detail: 'Before discounts and costs', tone: 'violet' },
      { label: 'Low Stock', value: lowStock, format: 'number', detail: 'At or below reorder level', tone: 'rose' },
    ],
    breakdowns: [
      { title: 'Units by Category', description: 'Current quantity across product categories.', format: 'number', rows: categoryRows },
      { title: 'Units by Status', description: 'Current quantity across inventory states.', format: 'number', rows: statusRows },
    ],
    columns: [
      { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Item' }, { key: 'category', label: 'Category', format: 'status' },
      { key: 'quantity', label: 'Stock', format: 'number' }, { key: 'reorderLevel', label: 'Low Level', format: 'number' },
      { key: 'buyPrice', label: 'Buy Price', format: 'currency' }, { key: 'sellPrice', label: 'Sell Price', format: 'currency' },
      { key: 'costValue', label: 'Cost Value', format: 'currency' }, { key: 'retailValue', label: 'Retail Value', format: 'currency' },
      { key: 'source', label: 'Source', format: 'status' }, { key: 'status', label: 'Status', format: 'status' },
    ],
    rows: items.slice(0, 500).map((item) => ({
      id: item._id, sku: item.sku, name: item.name, category: item.category, quantity: item.quantity,
      reorderLevel: item.reorderLevel, buyPrice: item.buyPrice, sellPrice: item.sellPrice,
      costValue: roundMoney(Number(item.buyPrice || 0) * Number(item.quantity || 0)),
      retailValue: roundMoney(Number(item.sellPrice || 0) * Number(item.quantity || 0)),
      source: item.source, status: item.status,
    })),
  })
}))

router.get('/pawns', requireAuth, allowRoles(...reportRoles), asyncRoute(async (req, res) => {
  await refreshReportPawnStatuses()
  const period = resolvePeriod(req.query, 'all_time')
  const currency = validChoice(req.query.currency || 'ALL', ['ALL', 'USD', 'KHR'], 'currency')
  const status = validChoice(req.query.status, ['ALL', 'ACTIVE', 'DUE_SOON', 'OVERDUE', 'RENEWED', 'REDEEMED', 'FORFEITED', 'CANCELLED'], 'pawn status')
  const staff = staffFilter(req.query.staff)
  const match = {
    ...(currency !== 'ALL' ? { currency } : {}),
    issueDate: { $gte: period.from, $lt: period.to },
    ...(status !== 'ALL' ? { status } : {}),
    ...(staff ? { createdBy: staff } : {}),
  }
  const pawns = await Pawn.find(match)
    .populate('customer', 'name phone')
    .populate('createdBy', 'name email role')
    .sort({ issueDate: -1, createdAt: -1 })
    .lean()

  const isAll = currency === 'ALL'
  const reportingCurrency = isAll ? 'USD' : currency
  const pawnPrincipalAmount = (pawn) => isAll ? convertToUsd(pawn.originalPrincipal, pawn.currency, pawn.exchangeRate).amountUsd : Number(pawn.originalPrincipal || 0)
  const pawnOutstandingAmount = (pawn) => isAll ? convertToUsd(pawn.remainingPrincipal, pawn.currency, pawn.exchangeRate).amountUsd : Number(pawn.remainingPrincipal || 0)
  const pawnPaidAmount = (pawn) => isAll ? convertToUsd(pawn.amountPaid, pawn.currency, pawn.exchangeRate).amountUsd : Number(pawn.amountPaid || 0)

  const originalPrincipal = roundMoney(pawns.reduce((sum, pawn) => sum + pawnPrincipalAmount(pawn), 0))
  const outstanding = roundMoney(pawns.reduce((sum, pawn) => sum + pawnOutstandingAmount(pawn), 0))
  const collected = roundMoney(pawns.reduce((sum, pawn) => sum + pawnPaidAmount(pawn), 0))
  const overdue = pawns.filter((pawn) => pawn.status === 'OVERDUE').length
  const redeemed = pawns.filter((pawn) => pawn.status === 'REDEEMED').length
  const forfeited = pawns.filter((pawn) => pawn.status === 'FORFEITED').length

  res.json({
    title: 'Pawn Report',
    description: 'Principal, repayments, overdue exposure, redemptions, and claimed collateral.',
    meta: {
      currency: reportingCurrency,
      currencyFilter: currency,
      normalized: isAll,
      period,
      totalRecords: pawns.length,
      limited: pawns.length > 500,
    },
    filters: { currency, status, staff: staff ? String(staff) : 'ALL' },
    staff: await reportStaff(),
    summary: [
      { label: 'Contracts', value: pawns.length, format: 'number', detail: period.label, tone: 'violet' },
      { label: 'Principal Lent', value: originalPrincipal, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : `Recorded in ${currency}`, tone: 'blue' },
      { label: 'Outstanding', value: outstanding, format: 'currency', detail: 'Remaining principal', tone: 'rose' },
      { label: 'Collected', value: collected, format: 'currency', detail: 'All recorded payments', tone: 'blue' },
      { label: 'Overdue', value: overdue, format: 'number', detail: 'Contracts needing action', tone: 'rose' },
      { label: 'Closed Outcomes', value: redeemed + forfeited, format: 'number', detail: `${redeemed} redeemed · ${forfeited} claimed`, tone: 'orange' },
    ],
    breakdowns: [
      { title: 'Contracts by Status', description: 'Contract count across the pawn lifecycle.', format: 'number', rows: breakdown(pawns, (pawn) => pawn.status) },
      { title: 'Principal by Condition', description: 'Original principal grouped by collateral condition.', format: 'currency', rows: breakdown(pawns, (pawn) => pawn.itemSnapshot?.condition || 'UNKNOWN', (pawn) => pawnPrincipalAmount(pawn)) },
    ],
    columns: [
      { key: 'date', label: 'Date', format: 'date' }, { key: 'reference', label: 'Pawn #' }, { key: 'party', label: 'Customer' },
      { key: 'item', label: 'Collateral' }, { key: 'currency', label: 'Currency', format: 'status' },
      { key: 'principal', label: 'Principal', format: 'currency' },
      { key: 'outstanding', label: 'Outstanding', format: 'currency' }, { key: 'paid', label: 'Paid', format: 'currency' },
      { key: 'dueDate', label: 'Due Date', format: 'date' }, { key: 'staff', label: 'Staff' }, { key: 'status', label: 'Status', format: 'status' },
    ],
    rows: pawns.slice(0, 500).map((pawn) => ({
      id: pawn._id, date: pawn.issueDate || pawn.createdAt, reference: pawn.pawnNo,
      party: pawn.customer?.name || 'Unknown customer', item: pawn.itemSnapshot?.name || 'Collateral',
      currency: pawn.currency,
      principal: pawn.originalPrincipal, outstanding: pawn.remainingPrincipal, paid: pawn.amountPaid,
      dueDate: pawn.dueDate, staff: publicStaff(pawn.createdBy), status: pawn.status,
    })),
  })
}))

router.get('/loans', requireAuth, allowRoles(...reportRoles), asyncRoute(async (req, res) => {
  await refreshLoanStatuses()
  const period = resolvePeriod(req.query, 'all_time')
  const currency = validChoice(req.query.currency || 'ALL', ['ALL', 'USD', 'KHR'], 'currency')
  const status = validChoice(req.query.status, ['ALL', 'ACTIVE', 'DUE_SOON', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'], 'loan status')
  const staff = staffFilter(req.query.staff)
  const match = {
    ...(currency !== 'ALL' ? { currency } : {}),
    loanDate: { $gte: period.from, $lt: period.to },
    ...(status !== 'ALL' ? { status } : {}),
    ...(staff ? { createdBy: staff } : {}),
  }
  const loans = await Loan.find(match).populate('createdBy', 'name email role').sort({ loanDate: -1, createdAt: -1 }).lean()

  const isAll = currency === 'ALL'
  const reportingCurrency = isAll ? 'USD' : currency
  let hasEstimatedKhrRate = false

  const isCancelled = (loan) => loan.status === 'CANCELLED'

  const loanPrincipalAmount = (loan) => {
    if (isCancelled(loan)) return 0
    if (!isAll) return Number(loan.principal || 0)
    const conv = convertToUsd(loan.principal, loan.currency, loan.exchangeRate)
    if (loan.currency === 'KHR' && (conv.isFallback || loan.exchangeRateEstimated)) hasEstimatedKhrRate = true
    return conv.amountUsd
  }
  const loanExpectedAmount = (loan) => isCancelled(loan) ? 0 : (isAll ? convertToUsd(loan.totalDue, loan.currency, loan.exchangeRate).amountUsd : Number(loan.totalDue || 0))
  const loanPaidAmount = (loan) => isCancelled(loan) ? 0 : (isAll ? convertToUsd(loan.amountPaid, loan.currency, loan.exchangeRate).amountUsd : Number(loan.amountPaid || 0))
  const loanOutstandingAmount = (loan) => isCancelled(loan) ? 0 : (isAll ? convertToUsd(loan.remainingBalance, loan.currency, loan.exchangeRate).amountUsd : Number(loan.remainingBalance || 0))

  const principal = roundMoney(loans.reduce((sum, loan) => sum + loanPrincipalAmount(loan), 0))
  const expected = roundMoney(loans.reduce((sum, loan) => sum + loanExpectedAmount(loan), 0))
  const paid = roundMoney(loans.reduce((sum, loan) => sum + loanPaidAmount(loan), 0))
  const outstanding = roundMoney(loans.reduce((sum, loan) => sum + loanOutstandingAmount(loan), 0))
  const overdue = loans.filter((loan) => loan.status === 'OVERDUE').length

  const notes = []
  if (isAll && hasEstimatedKhrRate) {
    notes.push('Some KHR loan totals contain estimated USD equivalents calculated with the fallback exchange rate.')
  }
  notes.push('Financial summary totals exclude cancelled loans.')

  res.json({
    title: 'Loans Report',
    description: 'Money lent, expected repayment, collected payments, and overdue balances. Financial summary totals exclude cancelled loans.',
    meta: {
      currency: reportingCurrency,
      currencyFilter: currency,
      normalized: isAll,
      period,
      totalRecords: loans.length,
      limited: loans.length > 500,
    },
    filters: { currency, status, staff: staff ? String(staff) : 'ALL' },
    staff: await reportStaff(),
    summary: [
      { label: 'Loans', value: loans.length, format: 'number', detail: period.label, tone: 'violet' },
      { label: 'Principal Lent', value: principal, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : `Recorded in ${currency}`, tone: 'blue' },
      { label: 'Expected', value: expected, format: 'currency', detail: 'Principal plus interest (excludes cancelled)', tone: 'orange' },
      { label: 'Collected', value: paid, format: 'currency', detail: 'Repayments recorded (excludes cancelled)', tone: 'blue' },
      { label: 'Outstanding', value: outstanding, format: 'currency', detail: 'Balance still due (excludes cancelled)', tone: 'rose' },
      { label: 'Overdue', value: overdue, format: 'number', detail: 'Loans needing action', tone: 'rose' },
    ],
    breakdowns: [
      { title: 'Loans by Status', description: 'Loan count across the repayment lifecycle.', format: 'number', rows: breakdown(loans, (loan) => loan.status) },
      { title: 'Outstanding by Reason', description: 'Remaining balance grouped by lending reason.', format: 'currency', rows: breakdown(loans.filter((loan) => !isCancelled(loan)), (loan) => loan.reason || 'NOT_RECORDED', (loan) => loanOutstandingAmount(loan)).slice(0, 8) },
    ],
    columns: [
      { key: 'date', label: 'Date', format: 'date' }, { key: 'reference', label: 'Loan #' }, { key: 'party', label: 'Borrower' },
      { key: 'currency', label: 'Currency', format: 'status' },
      { key: 'principal', label: 'Principal', format: 'currency' }, { key: 'expected', label: 'Expected', format: 'currency' },
      { key: 'paid', label: 'Paid', format: 'currency' }, { key: 'outstanding', label: 'Outstanding', format: 'currency' },
      { key: 'dueDate', label: 'Due Date', format: 'date' }, { key: 'staff', label: 'Staff' }, { key: 'status', label: 'Status', format: 'status' },
    ],
    rows: loans.slice(0, 500).map((loan) => ({
      id: loan._id, date: loan.loanDate || loan.createdAt, reference: loan.loanNo, party: loan.borrower?.name || 'Unknown borrower',
      currency: loan.currency,
      principal: loan.principal, expected: loan.totalDue, paid: loan.amountPaid, outstanding: loan.remainingBalance,
      dueDate: loan.dueDate, staff: publicStaff(loan.createdBy), status: loan.status,
    })),
    notes,
  })
}))

router.get('/payments', requireAuth, allowRoles(...reportRoles), asyncRoute(async (req, res) => {
  const period = resolvePeriod(req.query, 'this_month')
  const currency = validChoice(req.query.currency || 'ALL', ['ALL', 'USD', 'KHR'], 'currency')
  const method = validChoice(req.query.method, ['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'], 'payment method')
  const direction = validChoice(req.query.direction, ['ALL', 'IN', 'OUT'], 'payment direction')
  const methodMatch = method === 'ALL' ? {} : { paymentMethod: method }
  const isAll = currency === 'ALL'
  const reportingCurrency = isAll ? 'USD' : currency

  const tradeDateBranches = isAll
    ? [
        { type: 'BUY', purchaseDate: { $gte: period.from, $lt: period.to } },
        { type: 'BUY', purchaseDate: null, createdAt: { $gte: period.from, $lt: period.to } },
        { type: 'SELL', createdAt: { $gte: period.from, $lt: period.to } },
      ]
    : [
        { type: 'BUY', currency, purchaseDate: { $gte: period.from, $lt: period.to } },
        { type: 'BUY', currency, purchaseDate: null, createdAt: { $gte: period.from, $lt: period.to } },
      ]
  if (!isAll) {
    tradeDateBranches.unshift(currency === 'KHR'
      ? { type: 'SELL', currency: 'KHR', createdAt: { $gte: period.from, $lt: period.to } }
      : { type: 'SELL', currency: { $ne: 'KHR' }, createdAt: { $gte: period.from, $lt: period.to } })
  }

  const tradeReturnedMatch = isAll
    ? {
        status: 'RETURNED',
        type: 'SELL',
        $or: [
          { createdAt: { $gte: period.from, $lt: period.to } },
          { 'refund.refundedAt': { $gte: period.from, $lt: period.to } },
        ],
      }
    : {
        status: 'RETURNED',
        type: 'SELL',
        ...(currency === 'KHR' ? { currency: 'KHR' } : { currency: { $ne: 'KHR' } }),
        $or: [
          { createdAt: { $gte: period.from, $lt: period.to } },
          { 'refund.refundedAt': { $gte: period.from, $lt: period.to } },
        ],
      }

  const pawnMatch = {
    ...(isAll ? {} : { currency }),
    'payments.paidAt': { $gte: period.from, $lt: period.to },
  }

  const [trades, loanPayments, pawnRecords] = await Promise.all([
    Trade.find({
      ...methodMatch,
      $or: [
        { status: 'COMPLETED', $or: tradeDateBranches },
        tradeReturnedMatch,
      ],
    }).populate('customer', 'name').populate('supplier', 'name').populate('createdBy', 'name').populate('refund.refundedBy', 'name').lean(),
    LoanPayment.find({ paidAt: { $gte: period.from, $lt: period.to }, ...methodMatch })
      .populate({ path: 'loan', select: 'loanNo borrower currency exchangeRate exchangeRateEstimated' }).populate('receivedBy', 'name').lean(),
    method === 'ALL' || method === 'OTHER'
      ? Pawn.find(pawnMatch)
        .populate('customer', 'name').populate('payments.receivedBy', 'name').lean()
      : [],
  ])

  const entries = []
  let hasEstimatedKhrRate = false
  const normalizeAmount = (amount, sourceCurrency, exchangeRate, exchangeRateEstimated = false) => {
    const conversion = convertToUsd(amount, sourceCurrency, exchangeRate)
    if (isAll && sourceCurrency === 'KHR' && (conversion.isFallback || exchangeRateEstimated)) {
      hasEstimatedKhrRate = true
    }
    return conversion.amountUsd
  }
  for (const trade of trades) {
    const isPurchase = trade.type === 'BUY'
    const tradeCurrency = trade.currency === 'KHR' ? 'KHR' : 'USD'
    const amount = tradeCurrency === 'KHR'
      ? Number(trade.transactionAmountPaid ?? trade.amountPaid ?? 0)
      : Number(trade.amountPaid || 0)
    const normalizedAmount = normalizeAmount(amount, tradeCurrency, trade.exchangeRate)

    const transactionDate = new Date(trade.purchaseDate || trade.createdAt)
    const transactionInPeriod = transactionDate >= period.from && transactionDate < period.to
    const party = isPurchase ? trade.supplier?.name || trade.sellerSnapshot?.name || trade.customer?.name || 'Walk-in seller' : trade.customer?.name || 'Walk-in customer'
    if (transactionInPeriod) {
      entries.push({
        id: trade._id, date: transactionDate, reference: trade.tradeNo,
        party, source: isPurchase ? 'PURCHASE' : 'SALE', direction: isPurchase ? 'OUT' : 'IN', method: trade.paymentMethod,
        currency: tradeCurrency,
        amount,
        normalizedAmount,
        staff: publicStaff(trade.createdBy), status: 'COMPLETED',
      })
    }
    if (trade.status === 'RETURNED' && trade.refund?.refundedAt) {
      const refundedAt = new Date(trade.refund.refundedAt)
      if (refundedAt >= period.from && refundedAt < period.to) {
        const refundAmount = Number(trade.refund.amount || 0)
        const refundNormalizedAmount = normalizeAmount(refundAmount, tradeCurrency, trade.exchangeRate)
        entries.push({
          id: `${trade._id}-refund`, date: refundedAt, reference: trade.tradeNo,
          party, source: 'REFUND', direction: 'OUT', method: trade.paymentMethod,
          currency: tradeCurrency,
          amount: refundAmount,
          normalizedAmount: refundNormalizedAmount,
          staff: publicStaff(trade.refund.refundedBy), status: 'RETURNED',
        })
      }
    }
  }
  for (const payment of loanPayments) {
    if (!payment.loan) continue
    const loanCurrency = payment.loan.currency === 'KHR' ? 'KHR' : 'USD'
    if (!isAll && loanCurrency !== currency) continue
    const amount = Number(payment.amount || 0)
    const normalizedAmount = normalizeAmount(amount, loanCurrency, payment.loan.exchangeRate, payment.loan.exchangeRateEstimated)
    entries.push({
      id: payment._id, date: payment.paidAt, reference: payment.paymentNo,
      party: payment.loan.borrower?.name || 'Loan borrower', source: 'LOAN', direction: 'IN', method: payment.paymentMethod,
      currency: loanCurrency,
      amount,
      normalizedAmount,
      staff: publicStaff(payment.receivedBy), status: 'COMPLETED',
    })
  }
  for (const pawn of pawnRecords) {
    const pawnCurrency = pawn.currency === 'KHR' ? 'KHR' : 'USD'
    for (const payment of pawn.payments || []) {
      const paidAt = new Date(payment.paidAt)
      if (paidAt < period.from || paidAt >= period.to) continue
      const amount = Number(payment.amount || 0)
      const normalizedAmount = normalizeAmount(amount, pawnCurrency, pawn.exchangeRate)
      entries.push({
        id: payment._id, date: payment.paidAt, reference: pawn.pawnNo,
        party: pawn.customer?.name || 'Pawn customer', source: 'PAWN', direction: 'IN', method: 'OTHER',
        currency: pawnCurrency,
        amount,
        normalizedAmount,
        staff: publicStaff(payment.receivedBy), status: payment.type,
      })
    }
  }
  const filtered = entries
    .filter((entry) => direction === 'ALL' || entry.direction === direction)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const entryVal = (entry) => isAll ? entry.normalizedAmount : entry.amount
  const inflow = roundMoney(filtered.filter((entry) => entry.direction === 'IN').reduce((sum, entry) => sum + entryVal(entry), 0))
  const outflow = roundMoney(filtered.filter((entry) => entry.direction === 'OUT').reduce((sum, entry) => sum + entryVal(entry), 0))
  const methodRows = breakdown(filtered, (entry) => entry.method, (entry) => entryVal(entry))
  const sourceRows = breakdown(filtered, (entry) => entry.source, (entry) => entry.direction === 'OUT' ? -entryVal(entry) : entryVal(entry))

  res.json({
    title: 'Payments Report',
    description: 'Cash, KHQR, bank, card, and recorded daily money movement.',
    meta: {
      currency: reportingCurrency,
      currencyFilter: currency,
      normalized: isAll,
      period,
      totalRecords: filtered.length,
      limited: filtered.length > 500,
    },
    filters: { currency, method, direction },
    summary: [
      { label: 'Money In', value: inflow, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : period.label, tone: 'blue' },
      { label: 'Money Out', value: outflow, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : 'Purchases and refunds', tone: 'orange' },
      { label: 'Net Movement', value: roundMoney(inflow - outflow), format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : 'Money in minus money out', tone: 'violet' },
      { label: 'Payments', value: filtered.length, format: 'number', detail: 'Recorded entries', tone: 'blue' },
      { label: 'Cash Volume', value: roundMoney(filtered.filter((entry) => entry.method === 'CASH').reduce((sum, entry) => sum + entryVal(entry), 0)), format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : 'Cash handled', tone: 'violet' },
      { label: 'KHQR Volume', value: roundMoney(filtered.filter((entry) => entry.method === 'KHQR').reduce((sum, entry) => sum + entryVal(entry), 0)), format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : 'KHQR handled', tone: 'rose' },
    ],
    breakdowns: [
      { title: 'Volume by Method', description: 'Total payment volume by recorded method.', format: 'currency', rows: methodRows },
      { title: 'Net by Source', description: 'Incoming sources minus purchases and refunds.', format: 'currency', rows: sourceRows },
    ],
    columns: [
      { key: 'date', label: 'Date', format: 'dateTime' }, { key: 'reference', label: 'Reference' }, { key: 'party', label: 'Customer / Seller' },
      { key: 'source', label: 'Source', format: 'status' }, { key: 'direction', label: 'Direction', format: 'status' },
      { key: 'method', label: 'Method', format: 'status' }, { key: 'currency', label: 'Currency', format: 'status' },
      { key: 'amount', label: 'Amount', format: 'currency' },
      { key: 'staff', label: 'Staff' }, { key: 'status', label: 'Status', format: 'status' },
    ],
    rows: filtered.slice(0, 500).map((entry) => ({
      id: entry.id, date: entry.date, reference: entry.reference, party: entry.party,
      source: entry.source, direction: entry.direction, method: entry.method,
      currency: entry.currency, amount: entry.amount, staff: entry.staff, status: entry.status,
    })),
    notes: [
      'Pawn payments do not currently store a payment method, so they are reported as Other.',
      ...(isAll && hasEstimatedKhrRate
        ? ['Some KHR payment totals contain estimated USD equivalents calculated with the fallback exchange rate.']
        : []),
    ],
  })
}))

router.get('/services', requireAuth, allowRoles(...reportRoles), asyncRoute(async (req, res) => {
  const period = resolvePeriod(req.query, 'this_month')
  const currency = validChoice(req.query.currency || 'ALL', ['ALL', 'USD', 'KHR'], 'currency')
  const status = validChoice(req.query.status || 'COMPLETED', ['ALL', 'COMPLETED', 'CANCELLED'], 'service status')
  const category = validChoice(req.query.category, ['ALL', 'ACCOUNT_SETUP', 'DEVICE_SETUP', 'DATA_TRANSFER', 'SOFTWARE', 'OTHER'], 'service category')
  const method = validChoice(req.query.method, ['ALL', 'CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'], 'payment method')
  const staff = staffFilter(req.query.staff)
  const isAll = currency === 'ALL'
  const reportingCurrency = isAll ? 'USD' : currency
  const match = {
    ...(isAll ? {} : { currency }),
    completedAt: { $gte: period.from, $lt: period.to },
    ...(status !== 'ALL' ? { status } : {}),
    ...(category !== 'ALL' ? { 'serviceSnapshot.category': category } : {}),
    ...(method !== 'ALL' ? { paymentMethod: method } : {}),
    ...(staff ? { createdBy: staff } : {}),
  }
  const charges = await ServiceCharge.find(match)
    .populate('customer', 'name phone')
    .populate('createdBy', 'name email role')
    .sort({ completedAt: -1, createdAt: -1 })
    .lean()
  const completed = charges.filter((charge) => charge.status === 'COMPLETED')

  let hasEstimatedKhrRate = false
  const normalizedChargeAmount = (amount, charge) => {
    const conversion = convertToUsd(amount, charge.currency, charge.exchangeRate)
    if (charge.currency === 'KHR' && conversion.isFallback) hasEstimatedKhrRate = true
    return conversion.amountUsd
  }
  const chargeTotalAmount = (charge) => isAll
    ? normalizedChargeAmount(charge.total, charge)
    : Number(charge.total || 0)
  const chargeDiscountAmount = (charge) => isAll
    ? normalizedChargeAmount(charge.discount, charge)
    : Number(charge.discount || 0)

  const revenue = roundMoney(completed.reduce((sum, charge) => sum + chargeTotalAmount(charge), 0))
  const discounts = roundMoney(completed.reduce((sum, charge) => sum + chargeDiscountAmount(charge), 0))
  const jobs = completed.reduce((sum, charge) => sum + Number(charge.quantity || 1), 0)

  res.json({
    title: 'Service Charges Report',
    description: 'Paid account setup, device assistance, data transfer, and other service work.',
    meta: {
      currency: reportingCurrency,
      currencyFilter: currency,
      normalized: isAll,
      period,
      totalRecords: charges.length,
      limited: charges.length > 500,
    },
    filters: { currency, status, category, method, staff: staff ? String(staff) : 'ALL' },
    staff: await reportStaff(),
    summary: [
      { label: 'Service Revenue', value: revenue, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : `Recorded in ${currency}`, tone: 'violet' },
      { label: 'Completed Jobs', value: jobs, format: 'number', detail: period.label, tone: 'blue' },
      { label: 'Transactions', value: completed.length, format: 'number', detail: 'Completed charges', tone: 'blue' },
      { label: 'Discounts', value: discounts, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : 'Given to customers', tone: 'orange' },
      { label: 'Average Charge', value: completed.length ? roundMoney(revenue / completed.length) : 0, format: 'currency', detail: isAll ? 'USD equivalent across USD and KHR' : 'Per completed transaction', tone: 'violet' },
      { label: 'Cancelled', value: charges.filter((charge) => charge.status === 'CANCELLED').length, format: 'number', detail: 'Excluded from revenue', tone: 'rose' },
    ],
    breakdowns: [
      { title: 'Revenue by Service', description: 'Completed service revenue by service type.', format: 'currency', rows: breakdown(completed, (charge) => charge.serviceSnapshot?.name, (charge) => chargeTotalAmount(charge)) },
      { title: 'Revenue by Payment', description: 'Completed service revenue by payment method.', format: 'currency', rows: breakdown(completed, (charge) => charge.paymentMethod, (charge) => chargeTotalAmount(charge)) },
    ],
    columns: [
      { key: 'date', label: 'Date', format: 'dateTime' }, { key: 'reference', label: 'Service #' },
      { key: 'service', label: 'Service' }, { key: 'category', label: 'Category', format: 'status' },
      { key: 'party', label: 'Customer' }, { key: 'quantity', label: 'Qty', format: 'number' },
      { key: 'currency', label: 'Currency', format: 'status' },
      { key: 'total', label: 'Total', format: 'currency' }, { key: 'paymentMethod', label: 'Payment', format: 'status' },
      { key: 'staff', label: 'Staff' }, { key: 'status', label: 'Status', format: 'status' },
    ],
    rows: charges.slice(0, 500).map((charge) => ({
      id: charge._id, date: charge.completedAt || charge.createdAt, reference: charge.serviceNo,
      service: charge.serviceSnapshot?.name || 'Service', category: charge.serviceSnapshot?.category || 'OTHER',
      party: charge.customer?.name || charge.customerSnapshot?.name || 'Walk-in customer', quantity: charge.quantity,
      currency: charge.currency,
      total: charge.total, paymentMethod: charge.paymentMethod, staff: publicStaff(charge.createdBy), status: charge.status,
    })),
    notes: [
      'Service notes must never contain customer passwords, one-time codes, or recovery codes.',
      ...(isAll && hasEstimatedKhrRate
        ? ['Some KHR service totals contain estimated USD equivalents calculated with the fallback exchange rate.']
        : []),
    ],
  })
}))

router.get('/activity', requireAuth, allowRoles(...reportRoles), asyncRoute(async (req, res) => {
  const period = resolvePeriod(req.query, 'this_month')
  const action = String(req.query.action || 'ALL').toUpperCase()
  const entity = String(req.query.entity || 'ALL').toUpperCase()
  const staff = staffFilter(req.query.staff)
  const allActions = await ActivityLog.distinct('action')
  const allEntities = await ActivityLog.distinct('entity')
  if (action !== 'ALL' && !allActions.includes(action)) throw requestError(400, 'Select a valid action')
  if (entity !== 'ALL' && !allEntities.includes(entity)) throw requestError(400, 'Select a valid entity')
  const match = {
    createdAt: { $gte: period.from, $lt: period.to },
    ...(action !== 'ALL' ? { action } : {}),
    ...(entity !== 'ALL' ? { entity } : {}),
    ...(staff ? { user: staff } : {}),
  }
  const logs = await ActivityLog.find(match).populate('user', 'name email role').sort({ createdAt: -1 }).lean()
  const staffCount = new Set(logs.map((log) => String(log.user?._id || 'SYSTEM'))).size
  const reference = (log) => log.details?.tradeNo || log.details?.pawnNo || log.details?.loanNo || log.details?.paymentNo || log.entityId || '—'

  res.json({
    title: 'Activity Report',
    description: 'Staff actions and tamper-resistant audit history retained according to the configured retention policy.',
    meta: { period, totalRecords: logs.length, limited: logs.length > 500 },
    filters: { action, entity, staff: staff ? String(staff) : 'ALL' },
    staff: await reportStaff(),
    filterOptions: { actions: allActions.sort(), entities: allEntities.sort() },
    summary: [
      { label: 'Events', value: logs.length, format: 'number', detail: period.label, tone: 'violet' },
      { label: 'Active Staff', value: staffCount, format: 'number', detail: 'Including system events', tone: 'blue' },
      { label: 'Created', value: logs.filter((log) => log.action === 'CREATE').length, format: 'number', detail: 'Create actions', tone: 'blue' },
      { label: 'Updated', value: logs.filter((log) => log.action === 'UPDATE').length, format: 'number', detail: 'Update actions', tone: 'orange' },
      { label: 'Deleted', value: logs.filter((log) => log.action === 'DELETE').length, format: 'number', detail: 'Delete actions', tone: 'rose' },
      { label: 'Other Actions', value: logs.filter((log) => !['CREATE', 'UPDATE', 'DELETE'].includes(log.action)).length, format: 'number', detail: 'Payments and lifecycle events', tone: 'violet' },
    ],
    breakdowns: [
      { title: 'Events by Action', description: 'Audit events grouped by action.', format: 'number', rows: breakdown(logs, (log) => log.action) },
      { title: 'Events by Entity', description: 'Audit events grouped by affected record.', format: 'number', rows: breakdown(logs, (log) => log.entity) },
    ],
    columns: [
      { key: 'date', label: 'Date', format: 'dateTime' }, { key: 'action', label: 'Action', format: 'status' },
      { key: 'entity', label: 'Entity', format: 'status' }, { key: 'reference', label: 'Reference' },
      { key: 'staff', label: 'Staff' }, { key: 'role', label: 'Role', format: 'status' },
    ],
    rows: logs.slice(0, 500).map((log) => ({
      id: log._id, date: log.createdAt, action: log.action, entity: log.entity, reference: String(reference(log)),
      staff: publicStaff(log.user), role: log.user?.role || 'SYSTEM',
    })),
  })
}))

export default router
