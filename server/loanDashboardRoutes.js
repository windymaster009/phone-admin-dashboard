import { Router } from 'express'
import { requireAuth } from './auth.js'
import { Loan } from './loanModels.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100

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
    .map((loan) => ({ loan, nextStatus: statusForLoan(loan) }))
    .filter(({ loan, nextStatus }) => loan.status !== nextStatus)
    .map(({ loan, nextStatus }) => ({
      updateOne: {
        filter: { _id: loan._id, status: loan.status },
        update: {
          $set: {
            status: nextStatus,
            ...(nextStatus === 'PAID' ? { paidAt: new Date(), remainingBalance: 0 } : {}),
          },
        },
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

function buildSummary(loans) {
  const byCurrency = { USD: emptyCurrencySummary(), KHR: emptyCurrencySummary() }
  const counts = { total: loans.length, open: 0, dueSoon: 0, overdue: 0, paid: 0 }

  for (const loan of loans) {
    const currency = loan.currency === 'KHR' ? 'KHR' : 'USD'
    const bucket = byCurrency[currency]
    bucket.lent = roundMoney(bucket.lent + Number(loan.principal || 0))
    bucket.expected = roundMoney(bucket.expected + Number(loan.totalDue || 0))
    bucket.paid = roundMoney(bucket.paid + Number(loan.amountPaid || 0))
    bucket.outstanding = roundMoney(bucket.outstanding + Number(loan.remainingBalance || 0))

    if (loan.status === 'DUE_SOON') {
      counts.dueSoon += 1
      bucket.dueSoon = roundMoney(bucket.dueSoon + Number(loan.remainingBalance || 0))
    }
    if (loan.status === 'OVERDUE') {
      counts.overdue += 1
      bucket.overdue = roundMoney(bucket.overdue + Number(loan.remainingBalance || 0))
    }
    if (loan.status === 'PAID') counts.paid += 1
    else counts.open += 1
  }

  return { byCurrency, counts }
}

router.get('/', requireAuth, asyncRoute(async (_req, res) => {
  await refreshLoanStatuses()

  const [allLoans, urgentLoans] = await Promise.all([
    Loan.find({ status: { $ne: 'CANCELLED' } })
      .select('principal totalDue amountPaid remainingBalance currency status')
      .lean(),
    Loan.find({ status: { $in: ['OVERDUE', 'DUE_SOON'] } })
      .select('loanNo borrower remainingBalance totalDue amountPaid currency dueDate status reminderDays')
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(5)
      .lean(),
  ])

  res.json({
    summary: buildSummary(allLoans),
    urgentLoans,
    generatedAt: new Date().toISOString(),
  })
}))

export default router
