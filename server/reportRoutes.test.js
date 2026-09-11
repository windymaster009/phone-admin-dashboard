import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { Pawn, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Loan, LoanPayment } from './loanModels.js'
import { ServiceCharge } from './serviceModels.js'
import reportRouter from './reportRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-reports'
const testUserId = new mongoose.Types.ObjectId()
const testSessionId = 'report-test-session-1'

const testToken = jwt.sign(
  { sub: testUserId.toString(), sid: testSessionId },
  process.env.JWT_SECRET,
  { expiresIn: 3600 },
)

// Helper to simulate an Express GET request through reportRouter
async function callReportRoute(path, query = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET',
      url: path + '?' + new URLSearchParams(query).toString(),
      query,
      headers: {
        authorization: `Bearer ${testToken}`,
      },
      get(header) {
        return this.headers[header.toLowerCase()]
      },
    }

    let responseData = null
    let responseStatus = 200
    const res = {
      status(code) {
        responseStatus = code
        return this
      },
      json(data) {
        responseData = data
        resolve({ status: responseStatus, body: data })
      },
      cookie() {},
      clearCookie() {},
      setHeader() {},
      getHeader() {},
    }

    reportRouter.handle(req, res, (err) => {
      if (err) reject(err)
      else resolve({ status: responseStatus, body: responseData })
    })
  })
}

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById

test.beforeEach(() => {
  AuthSession.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    sessionId: testSessionId,
    user: testUserId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: testUserId,
      name: 'Test Manager',
      email: 'manager@phoneflow.test',
      role: 'MANAGER',
      active: true,
    }),
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById
})

test('Pawn Report: defaults to currency=ALL and normalizes mixed USD/KHR totals', async () => {
  const origUpdateMany = Pawn.updateMany
  const origFind = Pawn.find
  const origUserFind = User.find

  const samplePawns = [
    {
      _id: 'pawn-usd-1',
      pawnNo: 'PW-2026-001',
      currency: 'USD',
      exchangeRate: 1,
      originalPrincipal: 200,
      remainingPrincipal: 150,
      amountPaid: 50,
      status: 'ACTIVE',
      issueDate: new Date('2026-01-15T00:00:00Z'),
      dueDate: new Date('2026-02-15T00:00:00Z'),
      itemSnapshot: { name: 'iPhone 13', condition: 'GOOD' },
      customer: { name: 'Sokha' },
    },
    {
      _id: 'pawn-khr-1',
      pawnNo: 'PW-2026-002',
      currency: 'KHR',
      exchangeRate: 4100,
      originalPrincipal: 410000, // 100 USD equivalent
      remainingPrincipal: 205000, // 50 USD equivalent
      amountPaid: 205000, // 50 USD equivalent
      status: 'ACTIVE',
      issueDate: new Date('2026-01-20T00:00:00Z'),
      dueDate: new Date('2026-02-20T00:00:00Z'),
      itemSnapshot: { name: 'Samsung A54', condition: 'GOOD' },
      customer: { name: 'Dara' },
    },
  ]

  Pawn.updateMany = async () => ({ modifiedCount: 0 })
  User.find = () => ({
    select: () => ({ sort: () => ({ lean: async () => [] }) }),
  })
  let capturedMatch = null
  Pawn.find = (match) => {
    capturedMatch = match
    return {
      populate: () => ({
        populate: () => ({
          sort: () => ({
            lean: async () => samplePawns,
          }),
        }),
      }),
    }
  }

  try {
    const res = await callReportRoute('/pawns', { period: 'all_time' })
    assert.equal(res.status, 200)
    assert.equal(res.body.filters.currency, 'ALL')
    assert.equal(res.body.meta.currency, 'USD')
    assert.equal(res.body.meta.currencyFilter, 'ALL')
    assert.equal(res.body.meta.normalized, true)
    // Query should not filter by currency when ALL
    assert.equal(capturedMatch.currency, undefined)

    // Principal Lent: 200 USD + (410000 / 4100 = 100 USD) = 300 USD
    const principalSummary = res.body.summary.find((s) => s.label === 'Principal Lent')
    assert.equal(principalSummary.value, 300)
    assert.equal(principalSummary.detail, 'USD equivalent across USD and KHR')

    // Outstanding: 150 USD + 50 USD = 200 USD
    const outstandingSummary = res.body.summary.find((s) => s.label === 'Outstanding')
    assert.equal(outstandingSummary.value, 200)

    // Collected: 50 USD + 50 USD = 100 USD
    const collectedSummary = res.body.summary.find((s) => s.label === 'Collected')
    assert.equal(collectedSummary.value, 100)

    // Check Currency column exists
    assert.ok(res.body.columns.some((c) => c.key === 'currency'))

    // Check rows retain original amounts and currencies
    const usdRow = res.body.rows.find((r) => r.reference === 'PW-2026-001')
    assert.equal(usdRow.currency, 'USD')
    assert.equal(usdRow.principal, 200)

    const khrRow = res.body.rows.find((r) => r.reference === 'PW-2026-002')
    assert.equal(khrRow.currency, 'KHR')
    assert.equal(khrRow.principal, 410000)
  } finally {
    Pawn.updateMany = origUpdateMany
    Pawn.find = origFind
    User.find = origUserFind
  }
})

test('Pawn Report: exact USD and KHR modes query and aggregate in their original currency', async () => {
  const origUpdateMany = Pawn.updateMany
  const origFind = Pawn.find
  const origUserFind = User.find

  Pawn.updateMany = async () => ({ modifiedCount: 0 })
  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })

  let capturedCurrency = null
  Pawn.find = (match) => {
    capturedCurrency = match.currency
    const rows = match.currency === 'KHR'
      ? [{ _id: 'p1', pawnNo: 'P-K', currency: 'KHR', originalPrincipal: 410000, remainingPrincipal: 410000, amountPaid: 0, status: 'ACTIVE' }]
      : [{ _id: 'p2', pawnNo: 'P-U', currency: 'USD', originalPrincipal: 100, remainingPrincipal: 100, amountPaid: 0, status: 'ACTIVE' }]
    return {
      populate: () => ({ populate: () => ({ sort: () => ({ lean: async () => rows }) }) }),
    }
  }

  try {
    // Exact KHR
    const resKhr = await callReportRoute('/pawns', { currency: 'KHR', period: 'all_time' })
    assert.equal(capturedCurrency, 'KHR')
    assert.equal(resKhr.body.meta.currency, 'KHR')
    assert.equal(resKhr.body.meta.normalized, false)
    const khrPrincipal = resKhr.body.summary.find((s) => s.label === 'Principal Lent')
    assert.equal(khrPrincipal.value, 410000)
    assert.equal(khrPrincipal.detail, 'Recorded in KHR')

    // Exact USD
    const resUsd = await callReportRoute('/pawns', { currency: 'USD', period: 'all_time' })
    assert.equal(capturedCurrency, 'USD')
    assert.equal(resUsd.body.meta.currency, 'USD')
    assert.equal(resUsd.body.meta.normalized, false)
    const usdPrincipal = resUsd.body.summary.find((s) => s.label === 'Principal Lent')
    assert.equal(usdPrincipal.value, 100)
    assert.equal(usdPrincipal.detail, 'Recorded in USD')
  } finally {
    Pawn.updateMany = origUpdateMany
    Pawn.find = origFind
    User.find = origUserFind
  }
})

test('Loans Report: defaults to currency=ALL and discloses an estimated KHR exchange rate', async () => {
  const origLoanFind = Loan.find
  const origUserFind = User.find

  const sampleLoans = [
    {
      _id: 'loan-1',
      loanNo: 'LN-USD-1',
      borrower: { name: 'Borrower USD' },
      principal: 500,
      totalDue: 550,
      amountPaid: 100,
      remainingBalance: 450,
      currency: 'USD',
      exchangeRate: 1,
      status: 'ACTIVE',
    },
    {
      _id: 'loan-2',
      loanNo: 'LN-KHR-ESTIMATED',
      borrower: { name: 'Borrower KHR' },
      principal: 4100000, // 4,100,000 KHR = 1000 USD at fallback 4100
      totalDue: 4510000,  // 1100 USD
      amountPaid: 820000, // 200 USD
      remainingBalance: 3690000, // 900 USD
      currency: 'KHR',
      exchangeRate: 4100,
      exchangeRateEstimated: true,
      status: 'ACTIVE',
    },
  ]

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  let callCount = 0
  Loan.find = (match) => {
    callCount++
    // First find is in refreshLoanStatuses()
    if (callCount === 1) {
      return { select: () => ({ lean: async () => [] }) }
    }
    return {
      populate: () => ({
        sort: () => ({
          lean: async () => sampleLoans,
        }),
      }),
    }
  }

  try {
    const res = await callReportRoute('/loans', { period: 'all_time' })
    assert.equal(res.status, 200)
    assert.equal(res.body.filters.currency, 'ALL')
    assert.equal(res.body.meta.currency, 'USD')
    assert.equal(res.body.meta.normalized, true)

    // Total principal: 500 USD + (4,100,000 / 4100 = 1000 USD) = 1500 USD
    const principalSummary = res.body.summary.find((s) => s.label === 'Principal Lent')
    assert.equal(principalSummary.value, 1500)
    assert.equal(principalSummary.detail, 'USD equivalent across USD and KHR')

    // Expected: 550 + 1100 = 1650 USD
    const expectedSummary = res.body.summary.find((s) => s.label === 'Expected')
    assert.equal(expectedSummary.value, 1650)

    // Paid: 100 + 200 = 300 USD
    const paidSummary = res.body.summary.find((s) => s.label === 'Collected')
    assert.equal(paidSummary.value, 300)

    // Outstanding: 450 + 900 = 1350 USD
    const outstandingSummary = res.body.summary.find((s) => s.label === 'Outstanding')
    assert.equal(outstandingSummary.value, 1350)

    // Fallback note must be present
    assert.ok(res.body.notes.some((n) => n.includes('KHR loan totals contain estimated USD equivalents')))

    // Rows preserve original currencies
    const khrRow = res.body.rows.find((r) => r.reference === 'LN-KHR-ESTIMATED')
    assert.equal(khrRow.currency, 'KHR')
    assert.equal(khrRow.principal, 4100000)
  } finally {
    Loan.find = origLoanFind
    User.find = origUserFind
  }
})

test('Loans Report: exact USD and KHR modes keep original amounts', async () => {
  const origLoanFind = Loan.find
  const origUserFind = User.find

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  Loan.find = (match) => {
    if (match.status?.$nin) return { select: () => ({ lean: async () => [] }) }
    const rows = match.currency === 'KHR'
      ? [{ _id: 'lk', loanNo: 'LN-KHR', borrower: { name: 'Dara' }, currency: 'KHR', principal: 410000, totalDue: 451000, amountPaid: 41000, remainingBalance: 410000, status: 'ACTIVE' }]
      : [{ _id: 'lu', loanNo: 'LN-USD', borrower: { name: 'Sokha' }, currency: 'USD', principal: 100, totalDue: 110, amountPaid: 10, remainingBalance: 100, status: 'ACTIVE' }]
    return { populate: () => ({ sort: () => ({ lean: async () => rows }) }) }
  }

  try {
    const khr = await callReportRoute('/loans', { currency: 'KHR', period: 'all_time' })
    assert.equal(khr.body.meta.currency, 'KHR')
    assert.equal(khr.body.meta.normalized, false)
    assert.equal(khr.body.summary.find((item) => item.label === 'Principal Lent').value, 410000)

    const usd = await callReportRoute('/loans', { currency: 'USD', period: 'all_time' })
    assert.equal(usd.body.meta.currency, 'USD')
    assert.equal(usd.body.meta.normalized, false)
    assert.equal(usd.body.summary.find((item) => item.label === 'Principal Lent').value, 100)
  } finally {
    Loan.find = origLoanFind
    User.find = origUserFind
  }
})

test('Payments Report: combines Sales, Purchases, Refunds, Loan and Pawn payments across USD and KHR in ALL mode', async () => {
  const origTradeFind = Trade.find
  const origLoanPaymentFind = LoanPayment.find
  const origPawnFind = Pawn.find

  const trades = [
    {
      _id: 'trade-buy-khr',
      tradeNo: 'BY-KHR-001',
      type: 'BUY',
      currency: 'KHR',
      exchangeRate: 4100,
      transactionAmountPaid: 410000, // 100 USD
      amountPaid: 100,
      purchaseDate: new Date('2026-03-05T00:00:00Z'),
      paymentMethod: 'CASH',
      status: 'COMPLETED',
    },
    {
      _id: 'trade-sell-usd',
      tradeNo: 'SL-USD-001',
      type: 'SELL',
      currency: 'USD',
      exchangeRate: 1,
      amountPaid: 350,
      createdAt: new Date('2026-03-06T00:00:00Z'),
      paymentMethod: 'KHQR',
      status: 'COMPLETED',
    },
    {
      _id: 'trade-refund-khr',
      tradeNo: 'SL-KHR-002',
      type: 'SELL',
      currency: 'KHR',
      exchangeRate: 4100,
      transactionAmountPaid: 205000,
      status: 'RETURNED',
      refund: {
        amount: 205000, // 50 USD
        refundedAt: new Date('2026-03-07T00:00:00Z'),
      },
    },
  ]

  const loanPayments = [
    {
      _id: 'lp-1',
      paymentNo: 'PM-LN-01',
      amount: 410000, // 100 USD
      paymentMethod: 'BANK',
      paidAt: new Date('2026-03-08T00:00:00Z'),
      loan: { loanNo: 'LN-01', borrower: { name: 'Sophea' }, currency: 'KHR', exchangeRate: 4100 },
    },
  ]

  const pawnRecords = [
    {
      _id: 'pawn-rec-1',
      pawnNo: 'PW-01',
      currency: 'USD',
      exchangeRate: 1,
      customer: { name: 'Bopha' },
      payments: [
        { _id: 'pay-pawn-1', amount: 80, paidAt: new Date('2026-03-09T00:00:00Z'), type: 'INTEREST' },
      ],
    },
  ]

  Trade.find = () => ({
    populate: () => ({ populate: () => ({ populate: () => ({ populate: () => ({ lean: async () => trades }) }) }) }),
  })
  LoanPayment.find = () => ({
    populate: () => ({ populate: () => ({ lean: async () => loanPayments }) }),
  })
  Pawn.find = () => ({
    populate: () => ({ populate: () => ({ lean: async () => pawnRecords }) }),
  })

  try {
    const res = await callReportRoute('/payments', { period: 'all_time' })
    assert.equal(res.status, 200)
    assert.equal(res.body.meta.currency, 'USD')
    assert.equal(res.body.meta.normalized, true)

    // IN entries:
    // - SL-USD-001: 350 USD (sale)
    // - PM-LN-01: 100 USD (loan payment)
    // - pay-pawn-1: 80 USD (pawn payment)
    // Total IN = 350 + 100 + 80 = 530 USD
    const moneyIn = res.body.summary.find((s) => s.label === 'Money In')
    assert.equal(moneyIn.value, 530)

    // OUT entries:
    // - BY-KHR-001: 100 USD (purchase)
    // - SL-KHR-002 refund: 50 USD (refund)
    // Total OUT = 150 USD
    const moneyOut = res.body.summary.find((s) => s.label === 'Money Out')
    assert.equal(moneyOut.value, 150)

    // Net Movement = 530 - 150 = 380 USD
    const net = res.body.summary.find((s) => s.label === 'Net Movement')
    assert.equal(net.value, 380)

    // Cash volume: purchase (100 USD) = 100 USD
    const cashVol = res.body.summary.find((s) => s.label === 'Cash Volume')
    assert.equal(cashVol.value, 100)

    // KHQR volume: sale (350 USD) = 350 USD
    const khqrVol = res.body.summary.find((s) => s.label === 'KHQR Volume')
    assert.equal(khqrVol.value, 350)

    // Columns include currency
    assert.ok(res.body.columns.some((c) => c.key === 'currency'))

    // Detail rows preserve original currencies and amounts
    const buyRow = res.body.rows.find((r) => r.reference === 'BY-KHR-001')
    assert.equal(buyRow.currency, 'KHR')
    assert.equal(buyRow.amount, 410000)

    const sellRow = res.body.rows.find((r) => r.reference === 'SL-USD-001')
    assert.equal(sellRow.currency, 'USD')
    assert.equal(sellRow.amount, 350)
  } finally {
    Trade.find = origTradeFind
    LoanPayment.find = origLoanPaymentFind
    Pawn.find = origPawnFind
  }
})

test('Payments Report: exact USD and KHR modes keep original payment amounts', async () => {
  const origTradeFind = Trade.find
  const origLoanPaymentFind = LoanPayment.find
  const origPawnFind = Pawn.find
  let requestedCurrency = 'USD'

  Trade.find = () => ({
    populate: () => ({ populate: () => ({ populate: () => ({ populate: () => ({
      lean: async () => [{
        _id: `trade-${requestedCurrency}`,
        tradeNo: `SL-${requestedCurrency}`,
        type: 'SELL',
        currency: requestedCurrency,
        exchangeRate: requestedCurrency === 'KHR' ? 4100 : 1,
        amountPaid: requestedCurrency === 'KHR' ? 410000 : 100,
        createdAt: new Date('2026-03-06T00:00:00Z'),
        paymentMethod: 'CASH',
        status: 'COMPLETED',
      }],
    }) }) }) }),
  })
  LoanPayment.find = () => ({ populate: () => ({ populate: () => ({ lean: async () => [] }) }) })
  Pawn.find = () => ({ populate: () => ({ populate: () => ({ lean: async () => [] }) }) })

  try {
    requestedCurrency = 'KHR'
    const khr = await callReportRoute('/payments', { currency: 'KHR', period: 'all_time' })
    assert.equal(khr.body.meta.currency, 'KHR')
    assert.equal(khr.body.meta.normalized, false)
    assert.equal(khr.body.summary.find((item) => item.label === 'Money In').value, 410000)

    requestedCurrency = 'USD'
    const usd = await callReportRoute('/payments', { currency: 'USD', period: 'all_time' })
    assert.equal(usd.body.meta.currency, 'USD')
    assert.equal(usd.body.meta.normalized, false)
    assert.equal(usd.body.summary.find((item) => item.label === 'Money In').value, 100)
  } finally {
    Trade.find = origTradeFind
    LoanPayment.find = origLoanPaymentFind
    Pawn.find = origPawnFind
  }
})

test('Service Charges Report: defaults to currency=ALL and excludes cancelled charges from revenue', async () => {
  const origServiceFind = ServiceCharge.find
  const origUserFind = User.find

  const sampleCharges = [
    {
      _id: 'sc-1',
      serviceNo: 'SC-USD-01',
      serviceSnapshot: { name: 'Screen Protector', category: 'DEVICE_SETUP' },
      currency: 'USD',
      exchangeRate: 1,
      total: 20,
      discount: 2,
      quantity: 1,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      completedAt: new Date('2026-03-01T00:00:00Z'),
    },
    {
      _id: 'sc-2',
      serviceNo: 'SC-KHR-01',
      serviceSnapshot: { name: 'Data Transfer', category: 'DATA_TRANSFER' },
      currency: 'KHR',
      exchangeRate: 4100,
      total: 123000, // 30 USD
      discount: 0,
      quantity: 1,
      paymentMethod: 'KHQR',
      status: 'COMPLETED',
      completedAt: new Date('2026-03-02T00:00:00Z'),
    },
    {
      _id: 'sc-3',
      serviceNo: 'SC-CANCELLED',
      serviceSnapshot: { name: 'Software Update', category: 'SOFTWARE' },
      currency: 'USD',
      exchangeRate: 1,
      total: 100,
      quantity: 1,
      status: 'CANCELLED',
      completedAt: new Date('2026-03-03T00:00:00Z'),
    },
  ]

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  ServiceCharge.find = () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          lean: async () => sampleCharges,
        }),
      }),
    }),
  })

  try {
    const res = await callReportRoute('/services', { period: 'all_time' })
    assert.equal(res.status, 200)
    assert.equal(res.body.filters.currency, 'ALL')
    assert.equal(res.body.meta.currency, 'USD')
    assert.equal(res.body.meta.normalized, true)

    // Revenue: 20 USD + 30 USD = 50 USD (cancelled 100 USD excluded)
    const revenueSummary = res.body.summary.find((s) => s.label === 'Service Revenue')
    assert.equal(revenueSummary.value, 50)
    assert.equal(revenueSummary.detail, 'USD equivalent across USD and KHR')

    // Transactions: 2 completed
    const txSummary = res.body.summary.find((s) => s.label === 'Transactions')
    assert.equal(txSummary.value, 2)

    // Cancelled: 1
    const cancelSummary = res.body.summary.find((s) => s.label === 'Cancelled')
    assert.equal(cancelSummary.value, 1)

    // Columns include currency
    assert.ok(res.body.columns.some((c) => c.key === 'currency'))

    // Detail rows preserve original currencies and amounts
    const khrCharge = res.body.rows.find((r) => r.reference === 'SC-KHR-01')
    assert.equal(khrCharge.currency, 'KHR')
    assert.equal(khrCharge.total, 123000)
  } finally {
    ServiceCharge.find = origServiceFind
    User.find = origUserFind
  }
})

test('Service Charges Report: exact USD and KHR modes keep original totals', async () => {
  const origServiceFind = ServiceCharge.find
  const origUserFind = User.find

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  ServiceCharge.find = (match) => {
    const charge = match.currency === 'KHR'
      ? { _id: 'sk', serviceNo: 'SC-KHR', serviceSnapshot: { name: 'Setup', category: 'DEVICE_SETUP' }, currency: 'KHR', total: 410000, discount: 0, quantity: 1, paymentMethod: 'CASH', status: 'COMPLETED' }
      : { _id: 'su', serviceNo: 'SC-USD', serviceSnapshot: { name: 'Setup', category: 'DEVICE_SETUP' }, currency: 'USD', total: 100, discount: 0, quantity: 1, paymentMethod: 'CASH', status: 'COMPLETED' }
    return { populate: () => ({ populate: () => ({ sort: () => ({ lean: async () => [charge] }) }) }) }
  }

  try {
    const khr = await callReportRoute('/services', { currency: 'KHR', period: 'all_time' })
    assert.equal(khr.body.meta.currency, 'KHR')
    assert.equal(khr.body.meta.normalized, false)
    assert.equal(khr.body.summary.find((item) => item.label === 'Service Revenue').value, 410000)

    const usd = await callReportRoute('/services', { currency: 'USD', period: 'all_time' })
    assert.equal(usd.body.meta.currency, 'USD')
    assert.equal(usd.body.meta.normalized, false)
    assert.equal(usd.body.summary.find((item) => item.label === 'Service Revenue').value, 100)
  } finally {
    ServiceCharge.find = origServiceFind
    User.find = origUserFind
  }
})

test('Report totals are calculated from the complete filtered result before limiting to 500 rows', async () => {
  const origFind = Pawn.find
  const origUpdateMany = Pawn.updateMany
  const origUserFind = User.find

  // Generate 600 pawn records, each $10 principal
  const sixHundredPawns = Array.from({ length: 600 }, (_, i) => ({
    _id: `pawn-${i}`,
    pawnNo: `PW-${i}`,
    currency: 'USD',
    exchangeRate: 1,
    originalPrincipal: 10,
    remainingPrincipal: 10,
    amountPaid: 0,
    status: 'ACTIVE',
  }))

  Pawn.updateMany = async () => ({ modifiedCount: 0 })
  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  Pawn.find = () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          lean: async () => sixHundredPawns,
        }),
      }),
    }),
  })

  try {
    const res = await callReportRoute('/pawns', { period: 'all_time' })
    assert.equal(res.status, 200)
    assert.equal(res.body.meta.totalRecords, 600)
    assert.equal(res.body.meta.limited, true)
    // Rows must be capped at 500
    assert.equal(res.body.rows.length, 500)
    // Principal Lent must be 600 * 10 = 6000 USD, NOT 500 * 10 = 5000 USD
    const principalSummary = res.body.summary.find((s) => s.label === 'Principal Lent')
    assert.equal(principalSummary.value, 6000)
  } finally {
    Pawn.find = origFind
    Pawn.updateMany = origUpdateMany
    User.find = origUserFind
  }
})
