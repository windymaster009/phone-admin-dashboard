import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Loan, LoanPayment } from './loanModels.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const currencyCode = (value) => value === 'KHR' ? 'KHR' : 'USD'
const roundCurrency = (value, currency) => currency === 'KHR' ? Math.round(Number(value)) : roundMoney(value)
const clean = (value) => (typeof value === 'string' ? value.trim() : value)
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function currencyAmount(value, currency, fieldName, allowZero = false) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw requestError(400, `${fieldName} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`)
  }
  if (currency === 'KHR' && !Number.isInteger(amount)) {
    throw requestError(400, `${fieldName} must be a whole riel amount without decimals`)
  }
  return roundCurrency(amount, currency)
}

function makeCode(prefix) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${date}-${random}`
}

function parseDate(value, fieldName) {
  const raw = clean(String(value || ''))
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw)
  if (!raw || Number.isNaN(date.getTime())) throw requestError(400, `${fieldName} is invalid`)
  return date
}

function calculateInterest(principal, interestType, interestValue, currency) {
  const type = ['NONE', 'FIXED', 'PERCENT'].includes(String(interestType || '').toUpperCase())
    ? String(interestType).toUpperCase()
    : 'NONE'
  const rawValue = Math.max(0, Number(interestValue) || 0)
  const value = type === 'FIXED'
    ? currencyAmount(rawValue, currency, 'Fixed interest amount', true)
    : roundMoney(rawValue)
  const amount = type === 'FIXED'
    ? value
    : type === 'PERCENT'
      ? roundCurrency(principal * value / 100, currency)
      : 0
  return { type, value, amount: roundCurrency(amount, currency) }
}

function startOfDay(value) {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function statusForLoan(loan, now = new Date()) {
  if (loan.status === 'CANCELLED') return 'CANCELLED'
  if (Number(loan.remainingBalance) <= 0.005 || Number(loan.amountPaid) >= Number(loan.totalDue) - 0.005) return 'PAID'

  const daysUntilDue = Math.round((startOfDay(loan.dueDate).getTime() - startOfDay(now).getTime()) / 86_400_000)
  if (daysUntilDue < 0) return 'OVERDUE'
  if (daysUntilDue <= Number(loan.reminderDays ?? 3)) return 'DUE_SOON'
  if (Number(loan.amountPaid) > 0) return 'PARTIALLY_PAID'
  return 'ACTIVE'
}

async function refreshLoanStatuses() {
  const loans = await Loan.find({ status: { $nin: ['PAID', 'CANCELLED'] } })
    .select('_id status dueDate reminderDays amountPaid totalDue remainingBalance')
    .lean()
  const operations = loans
    .map((loan) => ({ loan, status: statusForLoan(loan) }))
    .filter(({ loan, status }) => loan.status !== status)
    .map(({ loan, status }) => ({
      updateOne: {
        filter: { _id: loan._id, status: loan.status },
        update: { $set: { status, ...(status === 'PAID' ? { paidAt: new Date(), remainingBalance: 0 } : {}) } },
      },
    }))
  if (operations.length > 0) await Loan.bulkWrite(operations)
}

function emptyCurrencySummary() {
  return {
    lent: 0,
    expected: 0,
    paid: 0,
    outstanding: 0,
    dueSoon: 0,
    overdue: 0,
  }
}

async function buildSummary() {
  const loans = await Loan.find({ status: { $ne: 'CANCELLED' } })
    .select('principal totalDue amountPaid remainingBalance currency status')
    .lean()

  const byCurrency = { USD: emptyCurrencySummary(), KHR: emptyCurrencySummary() }
  const counts = {
    total: loans.length,
    open: 0,
    dueSoon: 0,
    overdue: 0,
    paid: 0,
  }

  for (const loan of loans) {
    const currency = loan.currency === 'KHR' ? 'KHR' : 'USD'
    const bucket = byCurrency[currency]
    bucket.lent = roundCurrency(bucket.lent + Number(loan.principal || 0), currency)
    bucket.expected = roundCurrency(bucket.expected + Number(loan.totalDue || 0), currency)
    bucket.paid = roundCurrency(bucket.paid + Number(loan.amountPaid || 0), currency)
    bucket.outstanding = roundCurrency(bucket.outstanding + Number(loan.remainingBalance || 0), currency)
    if (loan.status === 'DUE_SOON') bucket.dueSoon = roundCurrency(bucket.dueSoon + Number(loan.remainingBalance || 0), currency)
    if (loan.status === 'OVERDUE') bucket.overdue = roundCurrency(bucket.overdue + Number(loan.remainingBalance || 0), currency)

    if (loan.status === 'PAID') counts.paid += 1
    else counts.open += 1
    if (loan.status === 'DUE_SOON') counts.dueSoon += 1
    if (loan.status === 'OVERDUE') counts.overdue += 1
  }

  return { byCurrency, counts }
}

function borrowerFromBody(body) {
  const borrower = body.borrower || body
  const name = clean(borrower.name || borrower.borrowerName)
  const phone = clean(borrower.phone || borrower.borrowerPhone)
  if (!name) throw requestError(400, 'Borrower name is required')
  if (!phone) throw requestError(400, 'Borrower phone number is required')
  return {
    name,
    phone,
    nationalIdNumber: clean(borrower.nationalIdNumber),
    address: clean(borrower.address),
  }
}

async function getLoanDetail(id, viewerRole) {
  const query = Loan.findById(id)
    .populate('createdBy', 'name role')
    .populate('updatedBy', 'name role')
  if (viewerRole === 'CASHIER') query.select('-borrower.nationalIdNumber -borrower.address')
  const loan = await query
  if (!loan) throw requestError(404, 'Loan not found')
  const payments = await LoanPayment.find({ loan: loan._id })
    .sort({ paidAt: -1, createdAt: -1 })
    .populate('receivedBy', 'name role')
  return { loan, payments }
}

router.get('/summary', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (_req, res) => {
  await refreshLoanStatuses()
  res.json({ summary: await buildSummary() })
}))

router.get('/', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  await refreshLoanStatuses()
  const query = {}
  const search = String(req.query.search || '').trim().slice(0, 80)
  const status = clean(req.query.status)?.toUpperCase()

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i')
    query.$or = [
      { loanNo: pattern },
      { 'borrower.name': pattern },
      { 'borrower.phone': pattern },
      { 'borrower.nationalIdNumber': pattern },
      { reason: pattern },
    ]
  }
  if (status && status !== 'ALL') query.status = status

  const loansQuery = Loan.find(query)
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(500)
    .populate('createdBy', 'name role')
  if (req.user.role === 'CASHIER') loansQuery.select('-borrower.nationalIdNumber -borrower.address')
  const loans = await loansQuery

  res.json({ loans, summary: await buildSummary() })
}))

router.get('/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  await refreshLoanStatuses()
  res.json(await getLoanDetail(req.params.id, req.user.role))
}))

router.post('/', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const borrower = borrowerFromBody(req.body)
  const currency = currencyCode(req.body.currency)
  const principal = currencyAmount(req.body.principal, currency, 'Loan amount')

  const loanDate = parseDate(req.body.loanDate || new Date(), 'Loan date')
  const dueDate = parseDate(req.body.dueDate, 'Due date')
  if (dueDate < loanDate) throw requestError(400, 'Due date cannot be before the loan date')

  const interest = calculateInterest(principal, req.body.interestType, req.body.interestValue, currency)
  const totalDue = roundCurrency(principal + interest.amount, currency)
  const reminderDays = Math.min(30, Math.max(0, Number(req.body.reminderDays ?? 3)))
  const draft = {
    status: 'ACTIVE',
    dueDate,
    reminderDays,
    amountPaid: 0,
    totalDue,
    remainingBalance: totalDue,
  }

  const loan = await Loan.create({
    loanNo: makeCode('LN'),
    borrower,
    principal,
    interestType: interest.type,
    interestValue: interest.value,
    interestAmount: interest.amount,
    totalDue,
    amountPaid: 0,
    remainingBalance: totalDue,
    currency,
    loanDate,
    dueDate,
    reminderDays,
    status: statusForLoan(draft),
    reason: clean(req.body.reason),
    notes: clean(req.body.notes),
    createdBy: req.user._id,
    updatedBy: req.user._id,
  })

  await writeActivity(req, {
    action: 'CREATE',
    entity: 'LOAN',
    entityId: loan._id,
    details: {
      loanNo: loan.loanNo,
      borrower: loan.borrower.name,
      principal: loan.principal,
      totalDue: loan.totalDue,
      currency: loan.currency,
      dueDate: loan.dueDate,
    },
  })

  res.status(201).json({ loan })
}))

router.patch('/:id', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const loan = await Loan.findById(req.params.id)
  if (!loan) throw requestError(404, 'Loan not found')
  if (loan.status === 'CANCELLED' || loan.status === 'PAID') throw requestError(409, 'Completed loans cannot be edited')

  if (req.body.borrower) loan.borrower = borrowerFromBody(req.body)
  if (req.body.dueDate !== undefined) {
    const dueDate = parseDate(req.body.dueDate, 'Due date')
    if (dueDate < loan.loanDate) throw requestError(400, 'Due date cannot be before the loan date')
    loan.dueDate = dueDate
  }
  if (req.body.reminderDays !== undefined) loan.reminderDays = Math.min(30, Math.max(0, Number(req.body.reminderDays) || 0))
  if (req.body.reason !== undefined) loan.reason = clean(req.body.reason)
  if (req.body.notes !== undefined) loan.notes = clean(req.body.notes)

  const financialKeys = ['principal', 'interestType', 'interestValue', 'currency']
  if (financialKeys.some((key) => req.body[key] !== undefined)) {
    if (loan.amountPaid > 0) throw requestError(409, 'Financial terms cannot be changed after a repayment')
    const currency = req.body.currency === undefined ? loan.currency : currencyCode(req.body.currency)
    const principal = currencyAmount(req.body.principal === undefined ? loan.principal : req.body.principal, currency, 'Loan amount')
    const interest = calculateInterest(
      principal,
      req.body.interestType === undefined ? loan.interestType : req.body.interestType,
      req.body.interestValue === undefined ? loan.interestValue : req.body.interestValue,
      currency,
    )
    loan.principal = principal
    loan.interestType = interest.type
    loan.interestValue = interest.value
    loan.interestAmount = interest.amount
    loan.totalDue = roundCurrency(principal + interest.amount, currency)
    loan.remainingBalance = loan.totalDue
    loan.currency = currency
  }

  loan.status = statusForLoan(loan)
  loan.updatedBy = req.user._id
  await loan.save()

  await writeActivity(req, {
    action: 'UPDATE',
    entity: 'LOAN',
    entityId: loan._id,
    details: { loanNo: loan.loanNo, dueDate: loan.dueDate, status: loan.status },
  })

  res.json({ loan })
}))

async function recordPaymentWithTransaction({ loanId, amount, paymentMethod, paidAt, reference, note, userId }) {
  const session = await mongoose.startSession()
  let result
  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findById(loanId).session(session)
      if (!loan) throw requestError(404, 'Loan not found')
      if (['PAID', 'CANCELLED'].includes(loan.status)) throw requestError(409, 'This loan no longer accepts repayments')
      const paymentAmount = currencyAmount(amount, loan.currency, 'Payment amount')
      if (paymentAmount > loan.remainingBalance + 0.005) throw requestError(400, 'Payment cannot exceed the remaining balance')

      loan.amountPaid = roundCurrency(loan.amountPaid + paymentAmount, loan.currency)
      loan.remainingBalance = roundCurrency(Math.max(0, loan.totalDue - loan.amountPaid), loan.currency)
      loan.status = statusForLoan(loan)
      loan.updatedBy = userId
      if (loan.status === 'PAID') loan.paidAt = paidAt
      await loan.save({ session })

      const [payment] = await LoanPayment.create([{
        paymentNo: makeCode('LP'),
        loan: loan._id,
        amount: paymentAmount,
        paymentMethod,
        paidAt,
        reference,
        note,
        receivedBy: userId,
      }], { session })
      result = { loan, payment }
    })
    return result
  } finally {
    await session.endSession()
  }
}

async function recordPaymentFallback({ loanId, amount, paymentMethod, paidAt, reference, note, userId }) {
  const current = await Loan.findById(loanId)
  if (!current) throw requestError(404, 'Loan not found')
  if (['PAID', 'CANCELLED'].includes(current.status)) throw requestError(409, 'This loan no longer accepts repayments')
  const paymentAmount = currencyAmount(amount, current.currency, 'Payment amount')
  if (paymentAmount > current.remainingBalance + 0.005) throw requestError(400, 'Payment cannot exceed the remaining balance')

  const nextPaid = roundCurrency(current.amountPaid + paymentAmount, current.currency)
  const nextRemaining = roundCurrency(Math.max(0, current.totalDue - nextPaid), current.currency)
  const candidate = {
    ...current.toObject(),
    amountPaid: nextPaid,
    remainingBalance: nextRemaining,
  }
  const nextStatus = statusForLoan(candidate)

  const loan = await Loan.findOneAndUpdate(
    {
      _id: current._id,
      amountPaid: current.amountPaid,
      remainingBalance: current.remainingBalance,
      status: current.status,
    },
    {
      $set: {
        amountPaid: nextPaid,
        remainingBalance: nextRemaining,
        status: nextStatus,
        updatedBy: userId,
        ...(nextStatus === 'PAID' ? { paidAt } : {}),
      },
    },
    { new: true, runValidators: true },
  )
  if (!loan) throw requestError(409, 'The loan changed while recording payment. Refresh and try again')

  try {
    const payment = await LoanPayment.create({
      paymentNo: makeCode('LP'),
      loan: loan._id,
      amount: paymentAmount,
      paymentMethod,
      paidAt,
      reference,
      note,
      receivedBy: userId,
    })
    return { loan, payment }
  } catch (error) {
    await Loan.findOneAndUpdate(
      { _id: current._id, amountPaid: nextPaid, remainingBalance: nextRemaining },
      {
        $set: {
          amountPaid: current.amountPaid,
          remainingBalance: current.remainingBalance,
          status: current.status,
          updatedBy: current.updatedBy,
          paidAt: current.paidAt,
        },
      },
    )
    throw error
  }
}

router.post('/:id/payments', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const amount = Number(req.body.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw requestError(400, 'Payment amount must be greater than zero')
  const paymentMethod = ['CASH', 'KHQR', 'BANK', 'CARD', 'OTHER'].includes(String(req.body.paymentMethod || '').toUpperCase())
    ? String(req.body.paymentMethod).toUpperCase()
    : 'CASH'
  const paidAt = req.body.paidAt ? parseDate(req.body.paidAt, 'Payment date') : new Date()
  const input = {
    loanId: req.params.id,
    amount,
    paymentMethod,
    paidAt,
    reference: clean(req.body.reference),
    note: clean(req.body.note),
    userId: req.user._id,
  }

  let result
  try {
    result = await recordPaymentWithTransaction(input)
  } catch (error) {
    const unsupported = /transaction numbers are only allowed|does not support transactions|transaction is not supported|replica set/i.test(error?.message || '')
    if (!unsupported) throw error
    result = await recordPaymentFallback(input)
  }

  await writeActivity(req, {
    action: 'CREATE',
    entity: 'LOAN_PAYMENT',
    entityId: result.payment._id,
    details: {
      loanId: result.loan._id,
      loanNo: result.loan.loanNo,
      paymentNo: result.payment.paymentNo,
      amount: result.payment.amount,
      remainingBalance: result.loan.remainingBalance,
      currency: result.loan.currency,
    },
  })

  res.status(201).json(await getLoanDetail(result.loan._id, req.user.role))
}))

router.post('/:id/cancel', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  const loan = await Loan.findById(req.params.id)
  if (!loan) throw requestError(404, 'Loan not found')
  if (loan.status === 'PAID') throw requestError(409, 'Paid loans cannot be cancelled')
  if (loan.amountPaid > 0) throw requestError(409, 'Loans with repayment history cannot be cancelled')
  if (loan.status === 'CANCELLED') return res.json({ loan })

  loan.status = 'CANCELLED'
  loan.cancelledAt = new Date()
  loan.updatedBy = req.user._id
  if (req.body.note) loan.notes = [loan.notes, clean(req.body.note)].filter(Boolean).join('\n')
  await loan.save()

  await writeActivity(req, {
    action: 'CANCEL',
    entity: 'LOAN',
    entityId: loan._id,
    details: { loanNo: loan.loanNo, borrower: loan.borrower.name },
  })

  res.json({ loan })
}))

export default router
