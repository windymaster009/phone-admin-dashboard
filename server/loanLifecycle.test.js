import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { User, ActivityLog } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Loan, LoanPayment } from './loanModels.js'
import { Receipt } from './receiptModels.js'
import loanRouter from './loanRoutes.js'
import loanDashboardRouter from './loanDashboardRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-loan-lifecycle'
mongoose.set('bufferCommands', false)

const testSessionId = 'loan-lifecycle-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00030'),
  name: 'Owner Alice',
  email: 'owner@phoneflow.test',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00031'),
  name: 'Manager Bob',
  email: 'manager@phoneflow.test',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00032'),
  name: 'Cashier Charlie',
  email: 'cashier@phoneflow.test',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00033'),
  name: 'Stock Dave',
  email: 'stock@phoneflow.test',
  role: 'STOCK',
  active: true,
}

let currentUser = mockOwner

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
const origActivityLogSave = ActivityLog.prototype.save
const origStartSession = mongoose.startSession

test.beforeEach(() => {
  currentUser = mockOwner
  AuthSession.findOne = async () => ({
    _id: new mongoose.Types.ObjectId(),
    sessionId: testSessionId,
    user: currentUser._id,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
  })
  AuthSession.updateOne = async () => ({ acknowledged: true })
  ActivityLog.prototype.save = async function () { return this }
  User.findById = () => ({
    select: () => Promise.resolve(currentUser),
  })
  mongoose.startSession = async () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {},
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  ActivityLog.prototype.save = origActivityLogSave
  User.findById = origUserFindById
  mongoose.startSession = origStartSession
})

function makeToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), sid: testSessionId },
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
  )
}

function callRouter(router, {
  method = 'GET',
  url = '/',
  headers = {},
  body = {},
  query = {},
  user = null,
} = {}) {
  return new Promise((resolve) => {
    if (user) currentUser = user

    const headerMap = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    if (!headerMap.authorization && !headerMap.cookie) {
      headerMap.authorization = `Bearer ${makeToken(currentUser)}`
    }

    const parsedUrl = new URL(url, 'http://localhost')
    const parsedQuery = { ...query }
    for (const [k, v] of parsedUrl.searchParams.entries()) {
      parsedQuery[k] = v
    }

    const req = {
      method: method.toUpperCase(),
      url: parsedUrl.pathname,
      originalUrl: url,
      headers: headerMap,
      body,
      query: parsedQuery,
      params: {},
      user: currentUser,
      ip: '127.0.0.1',
      get(name) {
        return this.headers[name.toLowerCase()]
      },
      socket: { remoteAddress: '127.0.0.1' },
      hostname: 'localhost',
    }

    let statusCode = 200
    let responseBody = null
    const responseHeaders = {}

    const res = {
      status(code) {
        statusCode = code
        return this
      },
      setHeader(name, val) {
        responseHeaders[name.toLowerCase()] = val
        return this
      },
      getHeader(name) {
        return responseHeaders[name.toLowerCase()]
      },
      json(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders })
      },
      send(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders })
      },
      end() {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders })
      },
    }

    router.handle(req, res, (err) => {
      if (err) {
        const code = err.status || 500
        resolve({ status: code, body: { message: err.message }, error: err })
      } else {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders })
      }
    })
  })
}

// ---------------------------------------------------------------------------
// 1. Role Restrictions
// ---------------------------------------------------------------------------

test('Loan server roles: CASHIER and STOCK cannot create loans (403)', async () => {
  const resCashier = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockCashier,
    body: { borrower: { name: 'Borrower 1' }, principal: 100, dueDate: '2026-10-01' },
  })
  assert.equal(resCashier.status, 403)

  const resStock = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockStock,
    body: { borrower: { name: 'Borrower 1' }, principal: 100, dueDate: '2026-10-01' },
  })
  assert.equal(resStock.status, 403)
})

test('Loan server roles: CASHIER cannot edit, cancel, or delete loans (403)', async () => {
  const loanId = new mongoose.Types.ObjectId().toString()

  const resEdit = await callRouter(loanRouter, {
    method: 'PATCH',
    url: `/${loanId}`,
    user: mockCashier,
    body: { reason: 'Updated' },
  })
  assert.equal(resEdit.status, 403)

  const resCancel = await callRouter(loanRouter, {
    method: 'POST',
    url: `/${loanId}/cancel`,
    user: mockCashier,
  })
  assert.equal(resCancel.status, 403)

  const resDelete = await callRouter(loanRouter, {
    method: 'DELETE',
    url: `/${loanId}`,
    user: mockCashier,
  })
  assert.equal(resDelete.status, 403)
})

test('Loan server roles: MANAGER cannot delete loans (403)', async () => {
  const loanId = new mongoose.Types.ObjectId().toString()

  const resDelete = await callRouter(loanRouter, {
    method: 'DELETE',
    url: `/${loanId}`,
    user: mockManager,
  })
  assert.equal(resDelete.status, 403)
})

test('Loan server roles: STOCK cannot view loans or record payments (403)', async () => {
  const loanId = new mongoose.Types.ObjectId().toString()

  const resStockList = await callRouter(loanRouter, {
    method: 'GET',
    url: '/',
    user: mockStock,
  })
  assert.equal(resStockList.status, 403)

  const resStockPay = await callRouter(loanRouter, {
    method: 'POST',
    url: `/${loanId}/payments`,
    user: mockStock,
    body: { amount: 50 },
  })
  assert.equal(resStockPay.status, 403)
})

// ---------------------------------------------------------------------------
// 2. Creation Validation & Error Cases
// ---------------------------------------------------------------------------

test('Loan creation: rejects missing borrower name (400)', async () => {
  const res = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockOwner,
    body: {
      borrower: { phone: '012345678' },
      principal: 200,
      dueDate: '2026-10-01',
    },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('Borrower name is required'))
})

test('Loan creation: rejects non-positive or non-numeric principal (400)', async () => {
  const resZero = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockOwner,
    body: { borrower: { name: 'Bob' }, principal: 0, dueDate: '2026-10-01' },
  })
  assert.equal(resZero.status, 400)
  assert.ok(resZero.body.message.includes('greater than zero'))

  const resNeg = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockOwner,
    body: { borrower: { name: 'Bob' }, principal: -50, dueDate: '2026-10-01' },
  })
  assert.equal(resNeg.status, 400)
  assert.ok(resNeg.body.message.includes('greater than zero'))
})

test('Loan creation: rejects decimal principal for KHR loans (400)', async () => {
  const res = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockOwner,
    body: {
      borrower: { name: 'Bob' },
      currency: 'KHR',
      principal: 1000.5,
      dueDate: '2026-10-01',
    },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('whole riel amount without decimals'))
})

test('Loan creation: rejects due date before loan date or invalid dates (400)', async () => {
  const resBefore = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockOwner,
    body: {
      borrower: { name: 'Bob' },
      principal: 100,
      loanDate: '2026-10-15',
      dueDate: '2026-10-01',
    },
  })
  assert.equal(resBefore.status, 400)
  assert.ok(resBefore.body.message.includes('Due date cannot be before the loan date'))

  const resInvalid = await callRouter(loanRouter, {
    method: 'POST',
    url: '/',
    user: mockOwner,
    body: {
      borrower: { name: 'Bob' },
      principal: 100,
      dueDate: 'not-a-valid-date',
    },
  })
  assert.equal(resInvalid.status, 400)
  assert.ok(resInvalid.body.message.includes('invalid'))
})

// ---------------------------------------------------------------------------
// 3. Interest Modes and Rounding on Creation
// ---------------------------------------------------------------------------

test('Loan creation: correctly calculates interest modes (NONE, FIXED, PERCENT) and totalDue', async () => {
  const origLoanCreate = Loan.create
  const origLoanFind = Loan.find
  Loan.find = () => ({ select: () => ({ lean: async () => [] }) })
  let captured = null
  Loan.create = async (payload) => {
    captured = payload
    return { _id: new mongoose.Types.ObjectId(), ...payload }
  }
  // Explicit dates make these financial assertions independent of today's date.
  const cases = [
    { currency: 'USD', principal: 500, interestType: 'NONE', interestValue: 10, interest: 0, total: 500 },
    { currency: 'USD', principal: 500, interestType: 'FIXED', interestValue: 25.5, interest: 25.5, total: 525.5 },
    { currency: 'KHR', principal: 2000000, interestType: 'FIXED', interestValue: 100000, interest: 100000, total: 2100000 },
    { currency: 'USD', principal: 1000, interestType: 'PERCENT', interestValue: 7.25, interest: 72.5, total: 1072.5 },
    { currency: 'KHR', principal: 2000000, interestType: 'PERCENT', interestValue: 5, interest: 100000, total: 2100000 },
  ]
  try {
    for (const { interest, total, ...terms } of cases) {
      captured = null
      const res = await callRouter(loanRouter, {
        method: 'POST', url: '/', user: mockOwner,
        body: { borrower: { name: 'Alice' }, loanDate: '2026-09-01', dueDate: '2026-10-01', ...terms },
      })
      assert.equal(res.status, 201, JSON.stringify(res.body))
      assert.ok(captured)
      assert.equal(captured.principal, terms.principal)
      assert.equal(captured.currency, terms.currency)
      assert.equal(captured.interestAmount, interest)
      assert.equal(captured.totalDue, total)
      assert.equal(captured.remainingBalance, total)
    }
  } finally {
    Loan.create = origLoanCreate
    Loan.find = origLoanFind
  }
})

// ---------------------------------------------------------------------------
// 4. Cashier Field Redaction (List & Detail)
// ---------------------------------------------------------------------------

test('Loan queries: CASHIER requests projections excluding borrower nationalIdNumber and address', async () => {
  const origLoanFind = Loan.find
  const origLoanFindById = Loan.findById
  const origLoanPaymentFind = LoanPayment.find

  const selectCalls = []
  function makeQueryMock() {
    const query = {
      select(fields) {
        selectCalls.push(fields)
        return query
      },
      sort() { return query },
      limit() { return query },
      populate() { return query },
      lean() { return Promise.resolve([]) },
      then(resolve) {
        return Promise.resolve([]).then(resolve)
      },
    }
    return query
  }

  Loan.find = () => makeQueryMock()

  let detailSelectCalled = null
  Loan.findById = () => {
    const detailQuery = {
      populate() { return detailQuery },
      select(fields) {
        detailSelectCalled = fields
        return detailQuery
      },
      then(resolve) {
        return Promise.resolve({
          _id: new mongoose.Types.ObjectId(),
          loanNo: 'LN-REDACT',
          borrower: { name: 'Confidential Person' },
        }).then(resolve)
      },
    }
    return detailQuery
  }
  LoanPayment.find = () => ({
    sort: () => ({
      populate: async () => [],
    }),
  })

  try {
    // 1. List for CASHIER
    await callRouter(loanRouter, { method: 'GET', url: '/', user: mockCashier })
    assert.ok(selectCalls.some((call) => typeof call === 'string' && call.includes('-borrower.nationalIdNumber')))
    assert.ok(selectCalls.some((call) => typeof call === 'string' && call.includes('-borrower.address')))

    // 2. Detail for CASHIER
    await callRouter(loanRouter, { method: 'GET', url: '/any-id', user: mockCashier })
    assert.ok(detailSelectCalled?.includes('-borrower.nationalIdNumber'))
    assert.ok(detailSelectCalled?.includes('-borrower.address'))
  } finally {
    Loan.find = origLoanFind
    Loan.findById = origLoanFindById
    LoanPayment.find = origLoanPaymentFind
  }
})

// ---------------------------------------------------------------------------
// 5. Loan Repayments & Concurrency Fallback
// ---------------------------------------------------------------------------

test('Loan repayments: rejects payments on PAID or CANCELLED loans (409)', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  // 1. PAID loan
  Loan.findById = () => ({
    session() {
      return {
        _id: loanId,
        status: 'PAID',
        remainingBalance: 0,
        amountPaid: 500,
        currency: 'USD',
      }
    },
  })

  try {
    const resPaid = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 50 },
    })
    assert.equal(resPaid.status, 409)
    assert.ok(resPaid.body.message.includes('no longer accepts repayments'))

    // 2. CANCELLED loan
    Loan.findById = () => ({
      session() {
        return {
          _id: loanId,
          status: 'CANCELLED',
          remainingBalance: 500,
          amountPaid: 0,
          currency: 'USD',
        }
      },
    })

    const resCancel = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 50 },
    })
    assert.equal(resCancel.status, 409)
    assert.ok(resCancel.body.message.includes('no longer accepts repayments'))
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan repayments: rejects amounts <= 0 or payments exceeding remaining balance (400)', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  Loan.findById = () => ({
    session() {
      return {
        _id: loanId,
        status: 'ACTIVE',
        totalDue: 500,
        remainingBalance: 300,
        amountPaid: 200,
        currency: 'USD',
      }
    },
  })

  try {
    // Non-positive amount
    const resZero = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 0 },
    })
    assert.equal(resZero.status, 400)
    assert.ok(resZero.body.message.includes('greater than zero'))

    // Exceeds remaining balance (300.01 > 300)
    const resExcess = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 300.05 },
    })
    assert.equal(resExcess.status, 400)
    assert.ok(resExcess.body.message.includes('cannot exceed the remaining balance'))
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan repayments: partial payment updates remainingBalance and amountPaid, full payment marks PAID', async () => {
  const origFindById = Loan.findById
  const origPaymentCreate = LoanPayment.create
  const origPaymentFind = LoanPayment.find
  const loanId = new mongoose.Types.ObjectId().toString()

  const fakeLoan = {
    _id: loanId,
    loanNo: 'LN-PAY-1',
    status: 'ACTIVE',
    totalDue: 500,
    remainingBalance: 500,
    amountPaid: 0,
    currency: 'USD',
    dueDate: new Date(Date.now() + 10 * 86400000),
    reminderDays: 3,
    save: async () => fakeLoan,
  }

  Loan.findById = (id) => {
    return {
      session() { return fakeLoan },
      populate() { return this },
      select() { return Promise.resolve(fakeLoan) },
      then(resolve) { return Promise.resolve(fakeLoan).then(resolve) },
    }
  }

  let createdPayment = null
  LoanPayment.create = async (items) => {
    createdPayment = {
      _id: new mongoose.Types.ObjectId(),
      ...items[0],
    }
    return [createdPayment]
  }

  LoanPayment.find = () => ({
    sort: () => ({
      populate: async () => [createdPayment],
    }),
  })

  try {
    // 1. Partial payment of 200
    const resPartial = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 200, paymentMethod: 'KHQR', reference: 'QR-001' },
    })
    assert.equal(resPartial.status, 201)
    assert.equal(fakeLoan.amountPaid, 200)
    assert.equal(fakeLoan.remainingBalance, 300)
    assert.equal(fakeLoan.status, 'PARTIALLY_PAID')

    // 2. Full payment of remaining 300
    const resFull = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 300, paymentMethod: 'CASH' },
    })
    assert.equal(resFull.status, 201)
    assert.equal(fakeLoan.amountPaid, 500)
    assert.equal(fakeLoan.remainingBalance, 0)
    assert.equal(fakeLoan.status, 'PAID')
    assert.ok(fakeLoan.paidAt)
  } finally {
    Loan.findById = origFindById
    LoanPayment.create = origPaymentCreate
    LoanPayment.find = origPaymentFind
  }
})

test('Loan repayments: fallback sends conditional updates and handles conflict/failure responses', async () => {
  const origFindById = Loan.findById
  const origFindOneAndUpdate = Loan.findOneAndUpdate
  const origPaymentCreate = LoanPayment.create
  const origPaymentFind = LoanPayment.find
  const loanId = new mongoose.Types.ObjectId().toString()

  // Make startSession throw unsupported transaction error
  mongoose.startSession = async () => ({
    withTransaction: async () => {
      throw new Error('This MongoDB deployment does not support transactions (standalone)')
    },
    endSession: async () => {},
  })

  const currentLoan = {
    _id: loanId,
    loanNo: 'LN-STANDALONE',
    status: 'ACTIVE',
    totalDue: 400,
    remainingBalance: 400,
    amountPaid: 0,
    currency: 'USD',
    dueDate: new Date(Date.now() + 7 * 86400000),
    reminderDays: 3,
    toObject() { return { ...this } },
  }

  Loan.findById = () => {
    return {
      populate() { return this },
      select() { return Promise.resolve(currentLoan) },
      then(resolve) { return Promise.resolve(currentLoan).then(resolve) },
    }
  }

  let updatedPayload = null
  Loan.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { _id: loanId, amountPaid: 0, remainingBalance: 400, status: 'ACTIVE' })
    assert.deepEqual(options, { new: true, runValidators: true })
    updatedPayload = update.$set
    return {
      ...currentLoan,
      ...updatedPayload,
    }
  }

  LoanPayment.create = async (payload) => ({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  })

  LoanPayment.find = () => ({
    sort: () => ({
      populate: async () => [],
    }),
  })

  try {
    const res = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/payments`,
      user: mockCashier,
      body: { amount: 150 },
    })
    assert.equal(res.status, 201)
    assert.equal(updatedPayload.amountPaid, 150)
    assert.equal(updatedPayload.remainingBalance, 250)
    assert.equal(updatedPayload.status, 'PARTIALLY_PAID')

    // A failed compare-and-update must not create a payment record.
    let paymentWrites = 0
    Loan.findOneAndUpdate = async () => null
    LoanPayment.create = async () => { paymentWrites += 1 }
    const conflict = await callRouter(loanRouter, {
      method: 'POST', url: `/${loanId}/payments`, user: mockCashier, body: { amount: 150 },
    })
    assert.equal(conflict.status, 409)
    assert.equal(paymentWrites, 0)

    // Verify the compensating update requested after a payment-write failure.
    // This mock checks the protocol, not atomic rollback in a real database.
    const updateCalls = []
    Loan.findOneAndUpdate = async (filter, update) => {
      updateCalls.push({ filter, update })
      return { ...currentLoan, ...update.$set }
    }
    LoanPayment.create = async () => { throw new Error('Payment write failed') }
    const failed = await callRouter(loanRouter, {
      method: 'POST', url: `/${loanId}/payments`, user: mockCashier, body: { amount: 150 },
    })
    assert.equal(failed.status, 500)
    assert.equal(updateCalls.length, 2)
    assert.deepEqual(updateCalls[1].filter, { _id: loanId, amountPaid: 150, remainingBalance: 250 })
    assert.equal(updateCalls[1].update.$set.amountPaid, 0)
    assert.equal(updateCalls[1].update.$set.remainingBalance, 400)
    assert.equal(updateCalls[1].update.$set.status, 'ACTIVE')
  } finally {
    Loan.findById = origFindById
    Loan.findOneAndUpdate = origFindOneAndUpdate
    LoanPayment.create = origPaymentCreate
    LoanPayment.find = origPaymentFind
  }
})

// ---------------------------------------------------------------------------
// 6. Loan Editing (PATCH)
// ---------------------------------------------------------------------------

test('Loan editing: cannot edit completed loans (PAID or CANCELLED) (409)', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  Loan.findById = async () => ({
    _id: loanId,
    status: 'PAID',
    amountPaid: 500,
  })

  try {
    const res = await callRouter(loanRouter, {
      method: 'PATCH',
      url: `/${loanId}`,
      user: mockOwner,
      body: { notes: 'Add note' },
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('Completed loans cannot be edited'))
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan editing: rejects financial terms change after a repayment (409)', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  Loan.findById = async () => ({
    _id: loanId,
    status: 'PARTIALLY_PAID',
    principal: 500,
    amountPaid: 100,
    remainingBalance: 400,
    currency: 'USD',
  })

  try {
    const res = await callRouter(loanRouter, {
      method: 'PATCH',
      url: `/${loanId}`,
      user: mockOwner,
      body: { principal: 600 },
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('Financial terms cannot be changed after a repayment'))
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan editing: allows changing terms on unpaid active loan and recalculates interest', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  const fakeLoan = {
    _id: loanId,
    status: 'ACTIVE',
    principal: 500,
    interestType: 'PERCENT',
    interestValue: 10,
    interestAmount: 50,
    totalDue: 550,
    remainingBalance: 550,
    amountPaid: 0,
    currency: 'USD',
    dueDate: new Date(Date.now() + 10 * 86400000),
    loanDate: new Date(),
    save: async () => fakeLoan,
  }

  Loan.findById = async () => fakeLoan

  try {
    const res = await callRouter(loanRouter, {
      method: 'PATCH',
      url: `/${loanId}`,
      user: mockOwner,
      body: {
        principal: 1000,
        interestValue: 5,
      },
    })
    assert.equal(res.status, 200)
    assert.equal(fakeLoan.principal, 1000)
    assert.equal(fakeLoan.interestAmount, 50) // 5% of 1000 = 50
    assert.equal(fakeLoan.totalDue, 1050)
    assert.equal(fakeLoan.remainingBalance, 1050)
  } finally {
    Loan.findById = origFindById
  }
})

// ---------------------------------------------------------------------------
// 7. Cancellation & Deletion
// ---------------------------------------------------------------------------

test('Loan cancellation: rejects paid loans or loans with repayment history (409)', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  // 1. Paid
  Loan.findById = async () => ({ _id: loanId, status: 'PAID', amountPaid: 200 })
  try {
    const resPaid = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/cancel`,
      user: mockOwner,
    })
    assert.equal(resPaid.status, 409)
    assert.ok(resPaid.body.message.includes('Paid loans cannot be cancelled'))

    // 2. Partial
    Loan.findById = async () => ({ _id: loanId, status: 'ACTIVE', amountPaid: 50 })
    const resPartial = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/cancel`,
      user: mockOwner,
    })
    assert.equal(resPartial.status, 409)
    assert.ok(resPartial.body.message.includes('repayment history cannot be cancelled'))
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan cancellation: successfully cancels unpaid loan', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  const fakeLoan = {
    _id: loanId,
    loanNo: 'LN-CANCEL-ME',
    borrower: { name: 'Borrower' },
    status: 'ACTIVE',
    amountPaid: 0,
    save: async () => fakeLoan,
  }
  Loan.findById = async () => fakeLoan

  try {
    const res = await callRouter(loanRouter, {
      method: 'POST',
      url: `/${loanId}/cancel`,
      user: mockOwner,
      body: { note: 'Cancelled by agreement' },
    })
    assert.equal(res.status, 200)
    assert.equal(fakeLoan.status, 'CANCELLED')
    assert.ok(fakeLoan.cancelledAt)
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan deletion: rejects active or open loans (409)', async () => {
  const origFindById = Loan.findById
  const loanId = new mongoose.Types.ObjectId().toString()

  Loan.findById = async () => ({
    _id: loanId,
    status: 'ACTIVE',
    amountPaid: 0,
  })

  try {
    const res = await callRouter(loanRouter, {
      method: 'DELETE',
      url: `/${loanId}`,
      user: mockOwner,
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('Only paid or cancelled loans can be deleted'))
  } finally {
    Loan.findById = origFindById
  }
})

test('Loan deletion: successfully removes PAID loan and linked records', async () => {
  const origFindById = Loan.findById
  const origReceiptDelete = Receipt.deleteMany
  const origPaymentDelete = LoanPayment.deleteMany
  const origLoanDelete = Loan.deleteOne
  const loanId = new mongoose.Types.ObjectId().toString()

  let receiptsDeleted = false
  let paymentsDeleted = false
  let loanDeleted = false

  Loan.findById = async () => ({
    _id: loanId,
    loanNo: 'LN-PAID-DELETE',
    borrower: { name: 'Borrower' },
    status: 'PAID',
  })
  Receipt.deleteMany = async () => { receiptsDeleted = true }
  LoanPayment.deleteMany = async () => { paymentsDeleted = true }
  Loan.deleteOne = async () => { loanDeleted = true }

  try {
    const res = await callRouter(loanRouter, {
      method: 'DELETE',
      url: `/${loanId}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.deleted, true)
    assert.equal(receiptsDeleted, true)
    assert.equal(paymentsDeleted, true)
    assert.equal(loanDeleted, true)
  } finally {
    Loan.findById = origFindById
    Receipt.deleteMany = origReceiptDelete
    LoanPayment.deleteMany = origPaymentDelete
    Loan.deleteOne = origLoanDelete
  }
})

// ---------------------------------------------------------------------------
// 8. Loan Dashboard Endpoint
// ---------------------------------------------------------------------------

test('Loan dashboard: aggregates counts, summaries by currency, and urgent loans', async () => {
  const origLoanFind = Loan.find
  let findCalls = 0

  Loan.find = (filter) => {
    findCalls += 1
    if (filter?.status?.$ne === 'CANCELLED') {
      return {
        select: () => ({
          lean: async () => [
            { principal: 1000, totalDue: 1100, amountPaid: 300, remainingBalance: 800, currency: 'USD', status: 'ACTIVE' },
            { principal: 500, totalDue: 550, amountPaid: 0, remainingBalance: 550, currency: 'USD', status: 'OVERDUE' },
            { principal: 4000000, totalDue: 4200000, amountPaid: 1000000, remainingBalance: 3200000, currency: 'KHR', status: 'DUE_SOON' },
          ],
        }),
      }
    }
    if (filter?.status?.$in) {
      return {
        select: () => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [
                { loanNo: 'LN-URGENT-1', status: 'OVERDUE' },
              ],
            }),
          }),
        }),
      }
    }
    return { select: () => ({ lean: async () => [] }) }
  }

  try {
    const res = await callRouter(loanDashboardRouter, {
      method: 'GET',
      url: '/',
      user: mockCashier,
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.summary.counts.total, 3)
    assert.equal(res.body.summary.counts.overdue, 1)
    assert.equal(res.body.summary.counts.dueSoon, 1)
    assert.equal(res.body.summary.byCurrency.USD.outstanding, 1350)
    assert.equal(res.body.summary.byCurrency.KHR.outstanding, 3200000)
    assert.equal(res.body.urgentLoans.length, 1)
  } finally {
    Loan.find = origLoanFind
  }
})
