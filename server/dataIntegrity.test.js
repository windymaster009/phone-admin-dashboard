import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import mainRouter from './routes.js'
import reportRouter from './reportRoutes.js'
import { Customer, Pawn, Supplier, Trade, User, ActivityLog } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { ServiceCharge } from './serviceModels.js'
import { CustomerDocument } from './documentModels.js'
import { Loan } from './loanModels.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-data-integrity'
const testUserId = new mongoose.Types.ObjectId()
const testSessionId = 'integrity-test-session-1'

const createTestToken = () => jwt.sign(
  { sub: testUserId.toString(), sid: testSessionId },
  process.env.JWT_SECRET,
  { expiresIn: 3600 },
)

async function callAppRoute(method, path, body = {}, query = {}, customHeaders = {}) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let responseData = null
    let responseStatus = 200

    const req = {
      method,
      url: path + (Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : ''),
      params: {},
      query,
      body,
      headers: {
        authorization: `Bearer ${createTestToken()}`,
        'content-type': 'application/json',
        ...customHeaders,
      },
      get(header) {
        const lower = header.toLowerCase()
        const entry = Object.entries(this.headers).find(([k]) => k.toLowerCase() === lower)
        return entry ? entry[1] : undefined
      },
      ip: '127.0.0.1',
    }

    const res = {
      status(code) {
        responseStatus = code
        return this
      },
      json(data) {
        responseData = data
        finish({ status: responseStatus, body: data })
        return this
      },
      send(data) {
        responseData = data
        finish({ status: responseStatus, body: data })
        return this
      },
      cookie() { return this },
      clearCookie() { return this },
      setHeader() { return this },
      getHeader() { return undefined },
    }

    mainRouter.handle(req, res, (err) => {
      if (err) {
        const status = err.status || err.statusCode || 500
        finish({ status, body: { message: err.message } })
      } else {
        finish({ status: responseStatus, body: responseData })
      }
    })
  })
}

async function callReportRoute(path, query = {}) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    let responseData = null
    let responseStatus = 200

    const req = {
      method: 'GET',
      url: path + (Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : ''),
      params: {},
      query,
      headers: {
        authorization: `Bearer ${createTestToken()}`,
        'content-type': 'application/json',
      },
      get(header) {
        return this.headers[header.toLowerCase()]
      },
      ip: '127.0.0.1',
    }

    const res = {
      status(code) {
        responseStatus = code
        return this
      },
      json(data) {
        responseData = data
        finish({ status: responseStatus, body: data })
        return this
      },
      send(data) {
        responseData = data
        finish({ status: responseStatus, body: data })
        return this
      },
      cookie() { return this },
      clearCookie() { return this },
      setHeader() { return this },
      getHeader() { return undefined },
    }

    reportRouter.handle(req, res, (err) => {
      if (err) {
        const status = err.status || err.statusCode || 500
        finish({ status, body: { message: err.message } })
      } else {
        finish({ status: responseStatus, body: responseData })
      }
    })
  })
}

// Global baseline mocks for authentication and activity log
const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
const origActivityLogSave = ActivityLog.prototype.save
const origMongooseTransaction = mongoose.connection.transaction
const origPawnExists = Pawn.exists

let loggedActivities = []

test.beforeEach(() => {
  loggedActivities = []
  AuthSession.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    sessionId: testSessionId,
    user: testUserId,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  ActivityLog.prototype.save = async function () {
    loggedActivities.push(this)
    return this
  }
  User.findById = () => ({
    select: () => Promise.resolve({
      _id: testUserId,
      name: 'Integrity Tester',
      email: 'tester@phoneflow.test',
      role: 'MANAGER',
      active: true,
    }),
  })
  mongoose.connection.transaction = async (callback) => {
    const session = {}
    return callback(session)
  }
  Pawn.exists = () => ({
    session: () => Promise.resolve(null),
    then: (resolve, reject) => Promise.resolve(null).then(resolve, reject),
    catch: (reject) => Promise.resolve(null).catch(reject),
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  ActivityLog.prototype.save = origActivityLogSave
  User.findById = origUserFindById
  mongoose.connection.transaction = origMongooseTransaction
  Pawn.exists = origPawnExists
})

// =========================================================================
// 1. Customer Deletion Guards
// =========================================================================
test('Customer deletion: blocked with 409 when linked to a ServiceCharge', async () => {
  const origPawnExists = Pawn.exists
  const origTradeExists = Trade.exists
  const origServiceChargeExists = ServiceCharge.exists
  const origDocExists = CustomerDocument.exists
  const origFindByIdAndDelete = Customer.findByIdAndDelete

  const customerId = new mongoose.Types.ObjectId().toString()
  Pawn.exists = async () => null
  Trade.exists = async () => null
  ServiceCharge.exists = async (query) => (query.customer === customerId ? { _id: 'sc1' } : null)
  CustomerDocument.exists = async () => null
  let deleteCalled = false
  Customer.findByIdAndDelete = async () => { deleteCalled = true }

  try {
    const res = await callAppRoute('DELETE', `/customers/${customerId}`)
    assert.equal(res.status, 409)
    assert.equal(res.body.message, 'This customer is linked to transaction history. Deactivate them instead.')
    assert.equal(deleteCalled, false)
  } finally {
    Pawn.exists = origPawnExists
    Trade.exists = origTradeExists
    ServiceCharge.exists = origServiceChargeExists
    CustomerDocument.exists = origDocExists
    Customer.findByIdAndDelete = origFindByIdAndDelete
  }
})

test('Customer deletion: blocked with 409 when linked to Pawn or Trade', async () => {
  const origPawnExists = Pawn.exists
  const origTradeExists = Trade.exists
  const origServiceChargeExists = ServiceCharge.exists
  const origDocExists = CustomerDocument.exists

  const customerId = new mongoose.Types.ObjectId().toString()
  CustomerDocument.exists = async () => null
  ServiceCharge.exists = async () => null

  try {
    // Blocked by Pawn
    Pawn.exists = async () => ({ _id: 'pawn1' })
    Trade.exists = async () => null
    const resPawn = await callAppRoute('DELETE', `/customers/${customerId}`)
    assert.equal(resPawn.status, 409)
    assert.equal(resPawn.body.message, 'This customer is linked to transaction history. Deactivate them instead.')

    // Blocked by Trade
    Pawn.exists = async () => null
    Trade.exists = async () => ({ _id: 'trade1' })
    const resTrade = await callAppRoute('DELETE', `/customers/${customerId}`)
    assert.equal(resTrade.status, 409)
    assert.equal(resTrade.body.message, 'This customer is linked to transaction history. Deactivate them instead.')
  } finally {
    Pawn.exists = origPawnExists
    Trade.exists = origTradeExists
    ServiceCharge.exists = origServiceChargeExists
    CustomerDocument.exists = origDocExists
  }
})

test('Customer deletion: unreferenced customer is deleted successfully', async () => {
  const origPawnExists = Pawn.exists
  const origTradeExists = Trade.exists
  const origServiceChargeExists = ServiceCharge.exists
  const origDocExists = CustomerDocument.exists
  const origFindByIdAndDelete = Customer.findByIdAndDelete

  const customerId = new mongoose.Types.ObjectId().toString()
  Pawn.exists = async () => null
  Trade.exists = async () => null
  ServiceCharge.exists = async () => null
  CustomerDocument.exists = async () => null
  let deletedId = null
  Customer.findByIdAndDelete = async (id) => {
    deletedId = id
    return { _id: id, name: 'Deletable Customer' }
  }

  try {
    const res = await callAppRoute('DELETE', `/customers/${customerId}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.message, 'Customer deleted')
    assert.equal(deletedId, customerId)
    assert.ok(loggedActivities.some((act) => act.action === 'DELETE' && act.entity === 'CUSTOMER'))
  } finally {
    Pawn.exists = origPawnExists
    Trade.exists = origTradeExists
    ServiceCharge.exists = origServiceChargeExists
    CustomerDocument.exists = origDocExists
    Customer.findByIdAndDelete = origFindByIdAndDelete
  }
})

// =========================================================================
// 2. Supplier Deletion Guards
// =========================================================================
test('Supplier deletion: blocked with 409 when linked to Trade history', async () => {
  const origTradeExists = Trade.exists
  const origFindByIdAndDelete = Supplier.findByIdAndDelete

  const supplierId = new mongoose.Types.ObjectId().toString()
  Trade.exists = async (query) => (query.supplier === supplierId ? { _id: 'tr1' } : null)
  let deleteCalled = false
  Supplier.findByIdAndDelete = async () => { deleteCalled = true }

  try {
    const res = await callAppRoute('DELETE', `/suppliers/${supplierId}`)
    assert.equal(res.status, 409)
    assert.equal(res.body.message, 'This supplier is linked to transaction history. Deactivate them instead.')
    assert.equal(deleteCalled, false)
  } finally {
    Trade.exists = origTradeExists
    Supplier.findByIdAndDelete = origFindByIdAndDelete
  }
})

test('Supplier deletion: unreferenced supplier is deleted successfully', async () => {
  const origTradeExists = Trade.exists
  const origFindByIdAndDelete = Supplier.findByIdAndDelete

  const supplierId = new mongoose.Types.ObjectId().toString()
  Trade.exists = async () => null
  let deletedId = null
  Supplier.findByIdAndDelete = async (id) => {
    deletedId = id
    return { _id: id, name: 'Deletable Supplier' }
  }

  try {
    const res = await callAppRoute('DELETE', `/suppliers/${supplierId}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.message, 'Supplier deleted')
    assert.equal(deletedId, supplierId)
    assert.ok(loggedActivities.some((act) => act.action === 'DELETE' && act.entity === 'SUPPLIER'))
  } finally {
    Trade.exists = origTradeExists
    Supplier.findByIdAndDelete = origFindByIdAndDelete
  }
})

// =========================================================================
// 3. Cancelled Loans Reporting
// =========================================================================
test('Loans Report: excludes cancelled loans from financial summary totals in ALL mode', async () => {
  const origLoanFind = Loan.find
  const origUserFind = User.find

  const sampleLoans = [
    {
      _id: 'loan-active-usd',
      loanNo: 'LN-USD-1',
      borrower: { name: 'Borrower USD' },
      principal: 500,
      totalDue: 550,
      amountPaid: 100,
      remainingBalance: 450,
      currency: 'USD',
      exchangeRate: 1,
      status: 'ACTIVE',
      reason: 'BUSINESS',
    },
    {
      _id: 'loan-active-khr',
      loanNo: 'LN-KHR-1',
      borrower: { name: 'Borrower KHR' },
      principal: 4100000, // 1000 USD
      totalDue: 4510000,  // 1100 USD
      amountPaid: 820000, // 200 USD
      remainingBalance: 3690000, // 900 USD
      currency: 'KHR',
      exchangeRate: 4100,
      exchangeRateEstimated: false,
      status: 'ACTIVE',
      reason: 'EXPANSION',
    },
    {
      _id: 'loan-cancelled-usd',
      loanNo: 'LN-USD-CANC',
      borrower: { name: 'Cancelled USD Borrower' },
      principal: 1000,
      totalDue: 1100,
      amountPaid: 0,
      remainingBalance: 1100,
      currency: 'USD',
      exchangeRate: 1,
      status: 'CANCELLED',
      reason: 'MISTAKE',
    },
    {
      _id: 'loan-cancelled-khr',
      loanNo: 'LN-KHR-CANC',
      borrower: { name: 'Cancelled KHR Borrower' },
      principal: 2050000, // would be 500 USD if counted
      totalDue: 2255000,
      amountPaid: 0,
      remainingBalance: 2255000,
      currency: 'KHR',
      exchangeRate: 4100,
      exchangeRateEstimated: true, // should NOT trigger note because loan is cancelled
      status: 'CANCELLED',
      reason: 'DUPLICATE',
    },
  ]

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  let callCount = 0
  Loan.find = () => {
    callCount++
    if (callCount === 1) return { select: () => ({ lean: async () => [] }) }
    return {
      populate: () => ({
        sort: () => ({
          lean: async () => sampleLoans,
        }),
      }),
    }
  }

  try {
    const res = await callReportRoute('/loans', { period: 'all_time', currency: 'ALL' })
    assert.equal(res.status, 200)

    // Total records counts all matching rows (4)
    assert.equal(res.body.meta.totalRecords, 4)
    const countSummary = res.body.summary.find((s) => s.label === 'Loans')
    assert.equal(countSummary.value, 4)

    // Financial totals exclude cancelled loans:
    // Principal = 500 (USD) + 1000 (KHR) = 1500 USD (cancelled 1000 USD + 500 USD omitted)
    const principalSummary = res.body.summary.find((s) => s.label === 'Principal Lent')
    assert.equal(principalSummary.value, 1500)

    // Expected = 550 (USD) + 1100 (KHR) = 1650 USD (cancelled 1100 USD + 550 USD omitted)
    const expectedSummary = res.body.summary.find((s) => s.label === 'Expected')
    assert.equal(expectedSummary.value, 1650)
    assert.ok(expectedSummary.detail.includes('excludes cancelled'))

    // Collected = 100 (USD) + 200 (KHR) = 300 USD
    const paidSummary = res.body.summary.find((s) => s.label === 'Collected')
    assert.equal(paidSummary.value, 300)
    assert.ok(paidSummary.detail.includes('excludes cancelled'))

    // Outstanding = 450 (USD) + 900 (KHR) = 1350 USD (cancelled 1100 USD + 550 USD omitted)
    const outstandingSummary = res.body.summary.find((s) => s.label === 'Outstanding')
    assert.equal(outstandingSummary.value, 1350)
    assert.ok(outstandingSummary.detail.includes('excludes cancelled'))

    // Report description and notes explicitly document that totals exclude cancelled loans
    assert.ok(res.body.description.includes('Financial summary totals exclude cancelled loans.'))
    assert.ok(res.body.notes.some((n) => n.includes('Financial summary totals exclude cancelled loans.')))

    // The cancelled KHR loan was estimated, but since it was cancelled, it did NOT contribute to totals,
    // so no fallback estimated rate notice should be pushed.
    assert.equal(res.body.notes.some((n) => n.includes('contain estimated USD equivalents')), false)

    // History rows preserve all 4 loans and their original amounts
    assert.equal(res.body.rows.length, 4)
    const cancelledRow = res.body.rows.find((r) => r.reference === 'LN-USD-CANC')
    assert.equal(cancelledRow.status, 'CANCELLED')
    assert.equal(cancelledRow.principal, 1000)
    assert.equal(cancelledRow.expected, 1100)

    // Breakdown: Loans by Status includes CANCELLED
    const statusBreakdown = res.body.breakdowns.find((b) => b.title === 'Loans by Status')
    const cancelledStatusRow = statusBreakdown.rows.find((r) => r.label === 'CANCELLED')
    assert.equal(cancelledStatusRow.count, 2)

    // Breakdown: Outstanding by Reason excludes cancelled loans
    const reasonBreakdown = res.body.breakdowns.find((b) => b.title === 'Outstanding by Reason')
    assert.equal(reasonBreakdown.rows.some((r) => r.label === 'MISTAKE'), false)
    assert.equal(reasonBreakdown.rows.some((r) => r.label === 'DUPLICATE'), false)
  } finally {
    Loan.find = origLoanFind
    User.find = origUserFind
  }
})

test('Loans Report: cancelled-only filter shows 0 financial totals and retains records in table', async () => {
  const origLoanFind = Loan.find
  const origUserFind = User.find

  const cancelledLoans = [
    {
      _id: 'loan-c1',
      loanNo: 'LN-C-1',
      borrower: { name: 'Borrower One' },
      principal: 700,
      totalDue: 770,
      amountPaid: 0,
      remainingBalance: 770,
      currency: 'USD',
      status: 'CANCELLED',
    },
  ]

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })
  let callCount = 0
  Loan.find = () => {
    callCount++
    if (callCount === 1) return { select: () => ({ lean: async () => [] }) }
    return {
      populate: () => ({
        sort: () => ({
          lean: async () => cancelledLoans,
        }),
      }),
    }
  }

  try {
    const res = await callReportRoute('/loans', { status: 'CANCELLED' })
    assert.equal(res.status, 200)

    assert.equal(res.body.summary.find((s) => s.label === 'Loans').value, 1)
    assert.equal(res.body.summary.find((s) => s.label === 'Principal Lent').value, 0)
    assert.equal(res.body.summary.find((s) => s.label === 'Expected').value, 0)
    assert.equal(res.body.summary.find((s) => s.label === 'Collected').value, 0)
    assert.equal(res.body.summary.find((s) => s.label === 'Outstanding').value, 0)
    assert.equal(res.body.summary.find((s) => s.label === 'Overdue').value, 0)

    // Table rows still list the cancelled loan with historical values
    assert.equal(res.body.rows.length, 1)
    assert.equal(res.body.rows[0].reference, 'LN-C-1')
    assert.equal(res.body.rows[0].principal, 700)
    assert.equal(res.body.rows[0].status, 'CANCELLED')
  } finally {
    Loan.find = origLoanFind
    User.find = origUserFind
  }
})

test('Loans Report: exact USD and KHR modes exclude cancelled loans', async () => {
  const origLoanFind = Loan.find
  const origUserFind = User.find

  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })

  Loan.find = (match) => {
    if (match.status?.$nin) return { select: () => ({ lean: async () => [] }) }
    const rows = match.currency === 'KHR'
      ? [
          { _id: 'lk-act', loanNo: 'LN-K-ACT', borrower: { name: 'Dara' }, currency: 'KHR', principal: 400000, totalDue: 440000, amountPaid: 40000, remainingBalance: 400000, status: 'ACTIVE' },
          { _id: 'lk-cnc', loanNo: 'LN-K-CNC', borrower: { name: 'Vuthy' }, currency: 'KHR', principal: 200000, totalDue: 220000, amountPaid: 0, remainingBalance: 220000, status: 'CANCELLED' },
        ]
      : [
          { _id: 'lu-act', loanNo: 'LN-U-ACT', borrower: { name: 'Sokha' }, currency: 'USD', principal: 100, totalDue: 110, amountPaid: 10, remainingBalance: 100, status: 'ACTIVE' },
          { _id: 'lu-cnc', loanNo: 'LN-U-CNC', borrower: { name: 'Bopha' }, currency: 'USD', principal: 50, totalDue: 55, amountPaid: 0, remainingBalance: 55, status: 'CANCELLED' },
        ]
    return { populate: () => ({ sort: () => ({ lean: async () => rows }) }) }
  }

  try {
    // Exact USD
    const resUsd = await callReportRoute('/loans', { currency: 'USD' })
    assert.equal(resUsd.status, 200)
    assert.equal(resUsd.body.summary.find((s) => s.label === 'Principal Lent').value, 100)
    assert.equal(resUsd.body.summary.find((s) => s.label === 'Expected').value, 110)
    assert.equal(resUsd.body.summary.find((s) => s.label === 'Collected').value, 10)
    assert.equal(resUsd.body.summary.find((s) => s.label === 'Outstanding').value, 100)

    // Exact KHR
    const resKhr = await callReportRoute('/loans', { currency: 'KHR' })
    assert.equal(resKhr.status, 200)
    assert.equal(resKhr.body.summary.find((s) => s.label === 'Principal Lent').value, 400000)
    assert.equal(resKhr.body.summary.find((s) => s.label === 'Expected').value, 440000)
    assert.equal(resKhr.body.summary.find((s) => s.label === 'Collected').value, 400000 ? 40000 : 0)
    assert.equal(resKhr.body.summary.find((s) => s.label === 'Outstanding').value, 400000)
  } finally {
    Loan.find = origLoanFind
    User.find = origUserFind
  }
})

// =========================================================================
// 4. Pawn Concurrency, Atomicity, and Duplicate Submissions
// =========================================================================
test('Pawn payment: rejects duplicate submission when no fee is due and aborts without audit write', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-2026-TEST',
    status: 'ACTIVE',
    currency: 'USD',
    remainingPrincipal: 100,
    accruedInterest: 0,
    fees: 0,
    feeModel: 'LEGACY_MONTHLY',
    payments: [],
    renewals: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => {},
  }

  Pawn.findById = () => fakePawn

  try {
    // Attempt payment when 0 fees are due
    const res = await callAppRoute('POST', `/pawns/${pawnId}/payment`, { note: 'Duplicate payment' })
    assert.equal(res.status, 400)
    assert.equal(res.body.message, 'No pawn fee is due today')
    // Verification: failed payment does not write an activity log
    assert.equal(loggedActivities.some((act) => act.action === 'PAYMENT' && act.entity === 'PAWN'), false)
  } finally {
    Pawn.findById = origFindById
  }
})

test('Pawn renewal: rejects request with 400 when idempotency key is missing or invalid', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-KEY-REQ',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    termDays: 7,
    remainingPrincipal: 100,
    accruedPawnFee: 0,
    fees: 0,
    dueDate: new Date(Date.now() + 7 * 86400000),
    renewals: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => {},
  }

  Pawn.findById = () => fakePawn

  try {
    // 1. Missing key in body and headers
    const resMissing = await callAppRoute('POST', `/pawns/${pawnId}/renew`, { termDays: 7 })
    assert.equal(resMissing.status, 400)
    assert.equal(resMissing.body.message, 'An idempotency key is required to renew this pawn contract')

    // 2. Whitespace-only key
    const resEmpty = await callAppRoute('POST', `/pawns/${pawnId}/renew`, { termDays: 7, idempotencyKey: '   ' })
    assert.equal(resEmpty.status, 400)
    assert.equal(resEmpty.body.message, 'An idempotency key is required to renew this pawn contract')

    // 3. Exceeds 128 characters
    const longKey = 'a'.repeat(129)
    const resLong = await callAppRoute('POST', `/pawns/${pawnId}/renew`, { termDays: 7, idempotencyKey: longKey })
    assert.equal(resLong.status, 400)
    assert.equal(resLong.body.message, 'Idempotency key cannot exceed 128 characters')

    // No audit logs written
    assert.equal(loggedActivities.some((act) => act.action === 'RENEW'), false)
  } finally {
    Pawn.findById = origFindById
  }
})

async function assertDailyRenewalReplay(t, workflowVersion) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-12T10:00:00+07:00') })
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const now = new Date()
  let saveCount = 0
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-DAILY-IDEM',
    workflowVersion,
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    dailyFeeRate: 0.1,
    termDays: 7,
    remainingPrincipal: 100,
    accruedPawnFee: 0,
    fees: 0,
    currentTermStartDate: now,
    // Inclusive contracts begin their next paid segment tomorrow.
    feeAccrualStartedAt: workflowVersion >= 5 ? new Date(now.getTime() + 86400000) : now,
    dueDate: new Date(now.getTime() + 7 * 86400000),
    gracePeriodDays: 3,
    renewals: [],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async function () { saveCount++; return this },
  }

  Pawn.findById = () => fakePawn

  try {
    const key = 'idem-daily-test-key-1'

    // 1. Initial valid renewal submission
    const res1 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: key,
    })
    assert.equal(res1.status, 200)
    assert.equal(fakePawn.renewals.length, 1)
    assert.equal(fakePawn.renewals[0].idempotencyKey, key)
    assert.equal(fakePawn.renewals[0].termDays, 7)
    const dueDateAfterFirst = new Date(fakePawn.dueDate).getTime()
    const balanceAfterFirst = fakePawn.remainingPrincipal
    const storedStateAfterFirst = JSON.stringify(fakePawn)
    assert.equal(saveCount, 1)
    assert.equal(res1.body.pawn.feeSummary.accruedFee, 0)
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)

    // 2. Immediate replay (< 3000ms) with same key and payload
    const res2 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: key,
    })
    assert.equal(res2.status, 200)
    assert.equal(fakePawn.renewals.length, 1, 'Replay within 3s must not add another renewal')
    assert.equal(new Date(fakePawn.dueDate).getTime(), dueDateAfterFirst, 'Due date must remain unchanged on replay')
    assert.equal(fakePawn.remainingPrincipal, balanceAfterFirst, 'Balance must remain unchanged on replay')
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1, 'Audit log count must remain unchanged')

    // 3. Replay after 4+ seconds (> 3000ms) with same key and payload
    // Confirmed defect verification: the old time-diff check failed here and created a duplicate renewal.
    t.mock.timers.tick(4001)
    assert.equal(Date.now() - now.getTime(), 4001)
    const res3 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: key,
    })
    assert.equal(res3.status, 200)
    assert.equal(fakePawn.renewals.length, 1, 'Replay after 4s must not add a second renewal')
    assert.equal(new Date(fakePawn.dueDate).getTime(), dueDateAfterFirst, 'Due date must remain unchanged after 4s replay')
    assert.equal(fakePawn.remainingPrincipal, balanceAfterFirst, 'Balance must remain unchanged after 4s replay')
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1, 'Audit log count must not increment after 4s replay')
    assert.deepEqual(res3.body.pawn.feeSummary, res1.body.pawn.feeSummary)

    // A retry on the next day returns today's fees without writing another renewal.
    t.mock.timers.setTime(now.getTime() + 86400000)
    const nextDayReplay = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: key,
    })
    assert.equal(nextDayReplay.status, 200)
    assert.equal(nextDayReplay.body.pawn.feeSummary.accruedFee, 0.1)
    assert.equal(nextDayReplay.body.pawn.feeSummary.redemptionTotal, 100.1)
    assert.equal(JSON.stringify(fakePawn), storedStateAfterFirst, 'Retries must not mutate persisted fees, dates, payments, or renewal history')
    assert.equal(saveCount, 1, 'Retries must not save again')
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)

    // Also verify when passed via Idempotency-Key header instead of body
    const resHeaderReplay = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
    }, {}, { 'Idempotency-Key': key })
    assert.equal(resHeaderReplay.status, 200)
    assert.equal(fakePawn.renewals.length, 1)
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)

    // 4. Replay with different terms (e.g. termDays: 15 instead of 7) returns 409
    const resDiffTerms = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 15,
      idempotencyKey: key,
    })
    assert.equal(resDiffTerms.status, 409)
    assert.equal(resDiffTerms.body.message, 'Idempotency key has already been used with different renewal terms')
    assert.equal(fakePawn.renewals.length, 1)
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)
  } finally {
    Pawn.findById = origFindById
  }
}

for (const workflowVersion of [3, 5]) {
  test(`Pawn renewal (daily v${workflowVersion}): retries preserve stored state and return current fees`, (t) => assertDailyRenewalReplay(t, workflowVersion))
}

test('Pawn renewal (daily): legitimate new renewal with fresh key succeeds and increments history and audit', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-DAILY-FRESH',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    dailyFeeRate: 0.1,
    termDays: 7,
    remainingPrincipal: 100,
    accruedPawnFee: 0,
    fees: 0,
    currentTermStartDate: new Date(),
    feeAccrualStartedAt: new Date(),
    dueDate: new Date(Date.now() + 7 * 86400000),
    gracePeriodDays: 3,
    renewals: [],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async function () { return this },
  }

  Pawn.findById = () => fakePawn

  try {
    // 1st renewal
    const res1 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: 'fresh-key-1',
    })
    assert.equal(res1.status, 200)
    assert.equal(fakePawn.renewals.length, 1)
    assert.equal(fakePawn.renewals[0].idempotencyKey, 'fresh-key-1')
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)

    // Reset fee accrual to simulate paid fees for 2nd legitimate renewal
    fakePawn.accruedPawnFee = 0
    fakePawn.fees = 0

    // 2nd legitimate renewal with a new key
    const res2 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 15,
      idempotencyKey: 'fresh-key-2',
    })
    assert.equal(res2.status, 200)
    assert.equal(fakePawn.renewals.length, 2)
    assert.equal(fakePawn.renewals[1].idempotencyKey, 'fresh-key-2')
    assert.equal(fakePawn.renewals[1].termDays, 15)
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 2)
  } finally {
    Pawn.findById = origFindById
  }
})

test('Pawn renewal (legacy): successful extension, replay after 4+ seconds, and rejection on different terms', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-12T10:00:00+07:00') })
  const startedAt = Date.now()
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const existingDueDate = new Date('2026-10-15T23:59:59.999+07:00')
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-LEGACY-IDEM',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'LEGACY_MONTHLY',
    remainingPrincipal: 200,
    interestRate: 2,
    accruedInterest: 0,
    fees: 0,
    dueDate: existingDueDate,
    renewals: [],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async function () { return this },
  }

  Pawn.findById = () => fakePawn

  try {
    const key = 'idem-legacy-test-key-1'

    // 1. Initial valid legacy renewal
    const res1 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      newDueDate: '2026-11-15',
      amount: 0,
      idempotencyKey: key,
    })
    assert.equal(res1.status, 200)
    assert.equal(fakePawn.renewals.length, 1)
    assert.equal(fakePawn.renewals[0].idempotencyKey, key)
    const dueDateAfterFirst = new Date(fakePawn.dueDate).getTime()
    const balanceAfterFirst = fakePawn.remainingPrincipal
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)

    // 2. Replay after 4+ seconds with same key and payload
    t.mock.timers.tick(4001)
    assert.equal(Date.now() - startedAt, 4001)
    const res2 = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      newDueDate: '2026-11-15',
      amount: 0,
      idempotencyKey: key,
    })
    assert.equal(res2.status, 200)
    assert.equal(fakePawn.renewals.length, 1, 'Legacy replay must not add another renewal')
    assert.equal(new Date(fakePawn.dueDate).getTime(), dueDateAfterFirst, 'Due date unchanged on legacy replay')
    assert.equal(fakePawn.remainingPrincipal, balanceAfterFirst, 'Balance unchanged on legacy replay')
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)

    // 3. Replay with different newDueDate returns 409
    const resDiffDate = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      newDueDate: '2026-12-01',
      amount: 0,
      idempotencyKey: key,
    })
    assert.equal(resDiffDate.status, 409)
    assert.equal(resDiffDate.body.message, 'Idempotency key has already been used with different renewal terms')

    // 4. Replay with different payment amount returns 409
    const resDiffAmount = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      newDueDate: '2026-11-15',
      amount: 50,
      idempotencyKey: key,
    })
    assert.equal(resDiffAmount.status, 409)
    assert.equal(resDiffAmount.body.message, 'Idempotency key has already been used with different renewal terms')

    assert.equal(fakePawn.renewals.length, 1)
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)
  } finally {
    Pawn.findById = origFindById
  }
})

test('Pawn renewal: rejects key reused across different pawn contracts with 409', async () => {
  const origFindById = Pawn.findById
  const origExists = Pawn.exists
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-CROSS-CONTRACT',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    termDays: 7,
    remainingPrincipal: 100,
    accruedPawnFee: 0,
    fees: 0,
    dueDate: new Date(Date.now() + 7 * 86400000),
    renewals: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => {},
  }

  Pawn.findById = () => fakePawn
  // Simulate key already exists on another pawn contract
  Pawn.exists = () => ({
    session: () => Promise.resolve({ _id: 'other-pawn-id' }),
  })

  try {
    const res = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: 'key-used-elsewhere',
    })
    assert.equal(res.status, 409)
    assert.equal(res.body.message, 'Idempotency key has already been used on another contract')
    assert.equal(fakePawn.renewals.length, 0)
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 0)
  } finally {
    Pawn.findById = origFindById
    Pawn.exists = origExists
  }
})

test('Pawn renewal: preserves historical renewals that have no idempotency key', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const historicalRenewal = {
    previousDueDate: new Date('2026-08-01'),
    newDueDate: new Date('2026-08-15'),
    paymentAmount: 0,
    termDays: 15,
    renewedAt: new Date('2026-08-01T12:00:00Z'),
    // Historical record with no idempotencyKey:
    idempotencyKey: undefined,
  }

  const now = new Date()
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-HISTORICAL',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    dailyFeeRate: 0.1,
    termDays: 7,
    remainingPrincipal: 100,
    accruedPawnFee: 0,
    fees: 0,
    currentTermStartDate: now,
    feeAccrualStartedAt: now,
    dueDate: new Date(now.getTime() + 7 * 86400000),
    renewals: [historicalRenewal],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async function () { return this },
  }

  Pawn.findById = () => fakePawn

  try {
    const res = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: 'new-key-after-history',
    })
    assert.equal(res.status, 200)
    assert.equal(fakePawn.renewals.length, 2)
    assert.equal(fakePawn.renewals[0].idempotencyKey, undefined, 'Historical record preserved without key')
    assert.equal(fakePawn.renewals[1].idempotencyKey, 'new-key-after-history', 'New record appended with key')
  } finally {
    Pawn.findById = origFindById
  }
})

test('Pawn renewal: handles transaction callback retry cleanly without duplicate audit log', async () => {
  const origFindById = Pawn.findById
  const origMongooseTransaction = mongoose.connection.transaction
  const pawnId = new mongoose.Types.ObjectId().toString()

  let attempts = 0
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-TX-RETRY',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    dailyFeeRate: 0.1,
    termDays: 7,
    remainingPrincipal: 100,
    accruedPawnFee: 0,
    fees: 0,
    currentTermStartDate: new Date(),
    feeAccrualStartedAt: new Date(),
    dueDate: new Date(Date.now() + 7 * 86400000),
    renewals: [],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async function () { return this },
  }

  Pawn.findById = () => fakePawn

  // Simulate a transaction runner that retries the callback on transient failure
  const initialRenewals = JSON.stringify(fakePawn.renewals)
  mongoose.connection.transaction = async (callback) => {
    attempts++
    const session = {}
    try {
      if (attempts === 1) {
        await callback(session)
        throw new Error('TransientTransactionError: write conflict')
      }
      return await callback(session)
    } catch (err) {
      if (err.message.includes('TransientTransactionError')) {
        // Rollback uncommitted memory state on transient abort
        fakePawn.renewals = JSON.parse(initialRenewals)
        attempts++
        return await callback(session)
      }
      throw err
    }
  }

  try {
    const res = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: 'tx-retry-key-1',
    })
    assert.equal(res.status, 200)
    assert.equal(attempts, 2, 'Transaction callback retried once')
    // Verification: exactly 1 audit log despite 2 callback attempts
    assert.equal(loggedActivities.filter((a) => a.action === 'RENEW').length, 1)
  } finally {
    Pawn.findById = origFindById
    mongoose.connection.transaction = origMongooseTransaction
  }
})

test('Pawn renewal (legacy): duplicate submission with same due date is rejected with 400', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const existingDueDate = new Date('2026-10-15T23:59:59.999+07:00')
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-LEGACY-TEST',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'LEGACY_MONTHLY',
    remainingPrincipal: 200,
    accruedInterest: 0,
    fees: 0,
    dueDate: existingDueDate,
    renewals: [],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => {},
  }

  Pawn.findById = () => fakePawn

  try {
    // Submitting with the same or earlier due date
    const res = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      newDueDate: '2026-10-15',
      amount: 0,
      idempotencyKey: 'legacy-invalid-date-key',
    })
    assert.equal(res.status, 400)
    assert.equal(res.body.message, 'New due date must be later than the current due date')
    assert.equal(loggedActivities.some((act) => act.action === 'RENEW' && act.entity === 'PAWN'), false)
  } finally {
    Pawn.findById = origFindById
  }
})

test('Pawn operations: payment and renewal on closed contracts (REDEEMED / FORFEITED) are rejected with 409', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const redeemedPawn = {
    _id: pawnId,
    status: 'REDEEMED',
    currency: 'USD',
    session() { return this },
    populate: async () => redeemedPawn,
  }

  Pawn.findById = () => redeemedPawn

  try {
    const resPayment = await callAppRoute('POST', `/pawns/${pawnId}/payment`, { note: 'Pay redeemed' })
    assert.equal(resPayment.status, 409)
    assert.equal(resPayment.body.message, 'This pawn contract is closed')

    const resRenew = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: 'closed-contract-key',
    })
    assert.equal(resRenew.status, 409)
    assert.equal(resRenew.body.message, 'This pawn contract is closed')

    assert.equal(loggedActivities.length, 0)
  } finally {
    Pawn.findById = origFindById
  }
})

test('Pawn transaction atomicity: transaction error aborts without logging activity or returning success', async () => {
  const origFindById = Pawn.findById
  const origMongooseTransaction = mongoose.connection.transaction
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-TX-ERR',
    status: 'ACTIVE',
    currency: 'USD',
    remainingPrincipal: 100,
    accruedInterest: 10,
    fees: 0,
    feeModel: 'LEGACY_MONTHLY',
    payments: [],
    renewals: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => {
      throw new Error('WriteConflict: simulated concurrent transaction conflict')
    },
  }

  Pawn.findById = () => fakePawn

  try {
    const res = await callAppRoute('POST', `/pawns/${pawnId}/payment`, { note: 'Conflicting payment' })
    assert.equal(res.status, 500)
    assert.ok(res.body.message.includes('WriteConflict'))
    // No success audit log was written
    assert.equal(loggedActivities.some((act) => act.action === 'PAYMENT' && act.entity === 'PAWN'), false)
  } finally {
    Pawn.findById = origFindById
    mongoose.connection.transaction = origMongooseTransaction
  }
})

test('Customer deletion: existing CustomerDocument guard returns 409', async () => {
  const origDocExists = CustomerDocument.exists
  const origFindByIdAndDelete = Customer.findByIdAndDelete

  const customerId = new mongoose.Types.ObjectId().toString()
  CustomerDocument.exists = async () => ({ _id: 'doc1' })
  let deleteCalled = false
  Customer.findByIdAndDelete = async () => { deleteCalled = true }

  try {
    const res = await callAppRoute('DELETE', `/customers/${customerId}`)
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('This customer has secure documents'))
    assert.equal(deleteCalled, false)
  } finally {
    CustomerDocument.exists = origDocExists
    Customer.findByIdAndDelete = origFindByIdAndDelete
  }
})

test('Pawn renewal (daily): requires unpaid fees to be cleared before extension', async () => {
  const origFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-DAILY-UNPAID',
    status: 'ACTIVE',
    currency: 'USD',
    feeModel: 'DAILY_SIMPLE',
    dailyFeeRate: 0.5,
    termDays: 7,
    remainingPrincipal: 200,
    accruedPawnFee: 15,
    fees: 0,
    currentTermStartDate: new Date(Date.now() - 15 * 86400000),
    feeAccrualStartedAt: new Date(Date.now() - 15 * 86400000),
    dueDate: new Date(Date.now() - 5 * 86400000),
    renewals: [],
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => {},
  }

  Pawn.findById = () => fakePawn

  try {
    const res = await callAppRoute('POST', `/pawns/${pawnId}/renew`, {
      termDays: 7,
      idempotencyKey: 'unpaid-fees-key',
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('Pay the current due fee of'))
    assert.equal(loggedActivities.some((act) => act.action === 'RENEW'), false)
  } finally {
    Pawn.findById = origFindById
  }
})

test('Supplier deletion: concurrency race analysis where reference is created after check', async () => {
  const origTradeExists = Trade.exists
  const origFindByIdAndDelete = Supplier.findByIdAndDelete

  const supplierId = new mongoose.Types.ObjectId().toString()

  // Concurrency scenario simulation:
  // Thread A (Delete Supplier): Trade.exists() returns null.
  // Interleaved Thread B (Create Trade): Trade is saved linking supplierId.
  // Thread A resumes: Supplier.findByIdAndDelete() executes.
  let tradeCreatedDuringDelete = false
  Trade.exists = async () => {
    // Check returns null (no trade yet recorded)
    return null
  }
  Supplier.findByIdAndDelete = async (id) => {
    // Simulated race condition: Trade was committed right before deletion executes
    tradeCreatedDuringDelete = true
    return { _id: id, name: 'Raced Supplier' }
  }

  try {
    const res = await callAppRoute('DELETE', `/suppliers/${supplierId}`)
    assert.equal(res.status, 200)
    // Document limitation: Since MongoDB lacks cross-collection foreign key constraints
    // without two-phase commit or transactional collection locking, a Trade created
    // in the exact millisecond between Trade.exists and findByIdAndDelete will result in an orphaned reference.
    assert.equal(tradeCreatedDuringDelete, true)
  } finally {
    Trade.exists = origTradeExists
    Supplier.findByIdAndDelete = origFindByIdAndDelete
  }
})
