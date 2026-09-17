import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import receiptRouter from './receiptRoutes.js'
import { ActivityLog, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Receipt } from './receiptModels.js'
import { Loan, LoanPayment } from './loanModels.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-receipt-routes-12345'
mongoose.set('bufferCommands', false)

const testSessionId = 'receipt-test-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00010'),
  name: 'Owner Alice',
  email: 'alice@shop.com',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00011'),
  name: 'Manager Bob',
  email: 'bob@shop.com',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00012'),
  name: 'Cashier Charlie',
  email: 'charlie@shop.com',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00013'),
  name: 'Stock Dave',
  email: 'dave@shop.com',
  role: 'STOCK',
  active: true,
}

let currentUser = mockOwner

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById

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
  User.findById = () => ({
    select: () => Promise.resolve(currentUser),
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById
})

// Track and stub activity logging
let activityLogs = []
ActivityLog.prototype.save = async function() {
  activityLogs.push(this)
  return this
}

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
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    )
    if (user && !headerMap.authorization && !headerMap.cookie) {
      headerMap.authorization = `Bearer ${makeToken(user)}`
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

// ---------------------- RBAC Tests ----------------------

test('Receipt Routes RBAC: blocks unauthenticated requests with 401', async () => {
  const res = await callRouter(receiptRouter, { method: 'GET', url: '/', user: null })
  assert.equal(res.status, 401)
})

test('Receipt Routes RBAC: blocks STOCK role with 403', async () => {
  const res = await callRouter(receiptRouter, { method: 'GET', url: '/', user: mockStock })
  assert.equal(res.status, 403)
})

test('Receipt Routes RBAC: permits CASHIER, MANAGER, and OWNER roles', async () => {
  const origFind = Receipt.find
  Receipt.find = () => ({
    sort: () => ({
      limit: () => ({
        populate: () => ({
          select: () => Promise.resolve([]),
        }),
      }),
    }),
  })

  try {
    const resCashier = await callRouter(receiptRouter, { method: 'GET', url: '/', user: mockCashier })
    assert.equal(resCashier.status, 200)

    const resManager = await callRouter(receiptRouter, { method: 'GET', url: '/', user: mockManager })
    assert.equal(resManager.status, 200)

    const resOwner = await callRouter(receiptRouter, { method: 'GET', url: '/', user: mockOwner })
    assert.equal(resOwner.status, 200)
  } finally {
    Receipt.find = origFind
  }
})

// ---------------------- GET /options Tests ----------------------

test('GET /options: returns SALE_RECEIPT option for completed sale', async () => {
  const origFindOne = Trade.findOne
  const tradeDoc = {
    _id: new mongoose.Types.ObjectId(),
    tradeNo: 'SL-OPT-001',
    type: 'SELL',
    status: 'COMPLETED',
    currency: 'USD',
    total: 350,
    amountPaid: 350,
    createdAt: new Date(),
    items: [],
  }

  const queryMock = {
    populate: () => queryMock,
    then(resolve) { resolve(tradeDoc) },
  }
  Trade.findOne = () => queryMock

  try {
    const res = await callRouter(receiptRouter, {
      method: 'GET',
      url: '/options?sourceType=TRADE&reference=SL-OPT-001',
      user: mockCashier,
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.sourceType, 'TRADE')
    assert.equal(res.body.referenceNo, 'SL-OPT-001')
    assert.equal(res.body.options.length, 1)
    assert.equal(res.body.options[0].documentType, 'SALE_RECEIPT')
    assert.equal(res.body.options[0].amount, 350)
  } finally {
    Trade.findOne = origFindOne
  }
})

test('GET /options: includes REFUND_RECEIPT option for returned sale with refund', async () => {
  const origFindOne = Trade.findOne
  const refundedTrade = {
    _id: new mongoose.Types.ObjectId(),
    tradeNo: 'SL-OPT-REFUNDED',
    type: 'SELL',
    status: 'RETURNED',
    currency: 'USD',
    total: 500,
    amountPaid: 500,
    refund: {
      amount: 500,
      refundedAt: new Date(),
      reason: 'Defective screen',
      inventoryDisposition: 'RESTOCK',
    },
    createdAt: new Date(),
    items: [],
  }

  const queryMock = {
    populate: () => queryMock,
    then(resolve) { resolve(refundedTrade) },
  }
  Trade.findOne = () => queryMock

  try {
    const res = await callRouter(receiptRouter, {
      method: 'GET',
      url: '/options?sourceType=TRADE&reference=SL-OPT-REFUNDED',
      user: mockManager,
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.options.length, 2)
    const refundOpt = res.body.options.find((o) => o.documentType === 'REFUND_RECEIPT')
    assert.ok(refundOpt)
    assert.equal(refundOpt.amount, 500)
    assert.equal(refundOpt.label, 'Refund receipt')
  } finally {
    Trade.findOne = origFindOne
  }
})

test('GET /options: returns 404 for missing reference and 400 for invalid sourceType', async () => {
  const origFindOne = Trade.findOne
  const queryMock = {
    populate: () => queryMock,
    then(resolve) { resolve(null) },
  }
  Trade.findOne = () => queryMock

  try {
    const resNotFound = await callRouter(receiptRouter, {
      method: 'GET',
      url: '/options?sourceType=TRADE&reference=UNKNOWN-REF',
      user: mockOwner,
    })
    assert.equal(resNotFound.status, 404)

    const resInvalidSource = await callRouter(receiptRouter, {
      method: 'GET',
      url: '/options?sourceType=INVALID&reference=ANY',
      user: mockOwner,
    })
    assert.equal(resInvalidSource.status, 400)
  } finally {
    Trade.findOne = origFindOne
  }
})

// ---------------------- POST /generate Tests ----------------------

test('POST /generate: unknown loan payment ID never falls back to another repayment', async () => {
  const originalLoanFindOne = Loan.findOne
  const originalPaymentFind = LoanPayment.find
  const loan = { _id: new mongoose.Types.ObjectId(), loanNo: 'LN-STRICT-001' }
  const loanQuery = { populate: () => loanQuery, then(resolve) { resolve(loan) } }
  const payments = [{ _id: new mongoose.Types.ObjectId(), amount: 25 }]
  Loan.findOne = () => loanQuery
  LoanPayment.find = () => ({ sort: () => ({ populate: async () => payments }) })
  try {
    const response = await callRouter(receiptRouter, {
      method: 'POST',
      url: '/generate',
      user: mockOwner,
      body: { sourceType: 'LOAN', reference: loan.loanNo, documentType: 'LOAN_PAYMENT', sourceSubId: 'missing-payment' },
    })
    assert.equal(response.status, 404)
    assert.match(response.body.message, /repayment was not found/i)
  } finally {
    Loan.findOne = originalLoanFindOne
    LoanPayment.find = originalPaymentFind
  }
})

test('POST /generate: creates immutable receipt snapshot (201 created: true)', async () => {
  const origFindOne = Trade.findOne
  const origReceiptCreate = Receipt.create
  const origReceiptFindOne = Receipt.findOne
  Receipt.findOne = () => ({ populate: async () => null })
  const origActivityCreate = ActivityLog.create

  const tradeDoc = {
    _id: new mongoose.Types.ObjectId(),
    tradeNo: 'SL-GEN-1',
    type: 'SELL',
    status: 'COMPLETED',
    currency: 'USD',
    total: 200,
    amountPaid: 200,
    subtotal: 200,
    discount: 0,
    createdAt: new Date(),
    customer: { name: 'Alice Customer', phone: '012999000' },
    items: [],
  }
  const queryMock = {
    populate: () => queryMock,
    then(resolve) { resolve(tradeDoc) },
  }
  Trade.findOne = () => queryMock

  let activityLogged = null
  ActivityLog.create = async (entries) => {
    activityLogged = entries[0]
    return entries
  }

  const createdReceipt = {
    _id: new mongoose.Types.ObjectId(),
    receiptNo: 'SR-20260913-TEST1',
    documentType: 'SALE_RECEIPT',
    sourceType: 'TRADE',
    sourceId: tradeDoc._id,
    total: 200,
    currency: 'USD',
    populate: async () => createdReceipt,
  }
  Receipt.create = async () => createdReceipt

  try {
    const res = await callRouter(receiptRouter, {
      method: 'POST',
      url: '/generate',
      body: { sourceType: 'TRADE', reference: 'SL-GEN-1', documentType: 'SALE_RECEIPT' },
      user: mockOwner,
    })

    assert.equal(res.status, 201)
    assert.equal(res.body.created, true)
    assert.equal(res.body.receipt.receiptNo, 'SR-20260913-TEST1')
    const log = activityLogs[activityLogs.length - 1]
    assert.ok(log)
    assert.equal(log.action, 'CREATE')
    assert.equal(log.entity, 'RECEIPT')
  } finally {
    Trade.findOne = origFindOne
    Receipt.create = origReceiptCreate
    Receipt.findOne = origReceiptFindOne
    ActivityLog.create = origActivityCreate
  }
})

test('POST /generate: duplicate generation returns existing receipt (200 created: false)', async () => {
  const origFindOne = Trade.findOne
  const origReceiptCreate = Receipt.create
  const origReceiptFindOne = Receipt.findOne

  const tradeDoc = {
    _id: new mongoose.Types.ObjectId(),
    tradeNo: 'SL-GEN-DUP',
    type: 'SELL',
    status: 'COMPLETED',
    currency: 'USD',
    total: 100,
    amountPaid: 100,
    createdAt: new Date(),
    items: [],
  }
  const queryMock = {
    populate: () => queryMock,
    then(resolve) { resolve(tradeDoc) },
  }
  Trade.findOne = () => queryMock

  const duplicateError = new Error('Duplicate key')
  duplicateError.code = 11000
  Receipt.create = async () => { throw duplicateError }

  const existingReceipt = {
    _id: new mongoose.Types.ObjectId(),
    receiptNo: 'SR-EXISTING-1',
    documentType: 'SALE_RECEIPT',
    sourceType: 'TRADE',
    sourceId: tradeDoc._id,
    total: 100,
    currency: 'USD',
  }
  const populateMock = {
    populate: async () => existingReceipt,
  }
  Receipt.findOne = () => populateMock

  try {
    const res = await callRouter(receiptRouter, {
      method: 'POST',
      url: '/generate',
      body: { sourceType: 'TRADE', reference: 'SL-GEN-DUP', documentType: 'SALE_RECEIPT' },
      user: mockCashier,
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.created, false)
    assert.equal(res.body.receipt.receiptNo, 'SR-EXISTING-1')
  } finally {
    Trade.findOne = origFindOne
    Receipt.create = origReceiptCreate
    Receipt.findOne = origReceiptFindOne
  }
})

test('POST /generate: REFUND_RECEIPT requires returned sale status (409 on unreturned sale)', async () => {
  const origFindOne = Trade.findOne
  const unreturnedSale = {
    _id: new mongoose.Types.ObjectId(),
    tradeNo: 'SL-NOT-REFUNDED',
    type: 'SELL',
    status: 'COMPLETED', // not RETURNED
    currency: 'USD',
    total: 300,
    amountPaid: 300,
    createdAt: new Date(),
    items: [],
  }
  const queryMock = {
    populate: () => queryMock,
    then(resolve) { resolve(unreturnedSale) },
  }
  Trade.findOne = () => queryMock

  try {
    const res = await callRouter(receiptRouter, {
      method: 'POST',
      url: '/generate',
      body: { sourceType: 'TRADE', reference: 'SL-NOT-REFUNDED', documentType: 'REFUND_RECEIPT' },
      user: mockOwner,
    })
    assert.equal(res.status, 409)
    assert.match(res.body.message, /available only after a completed sale has been refunded/i)
  } finally {
    Trade.findOne = origFindOne
  }
})

// ---------------------- POST /:id/printed and alias /:id/print Tests ----------------------

test('POST /:id/printed: increments printCount, sets firstPrintedAt on first print, and logs PRINT', async () => {
  const origFindById = Receipt.findById
  const origFindByIdAndUpdate = Receipt.findByIdAndUpdate
  const origActivityCreate = ActivityLog.create

  const receiptId = new mongoose.Types.ObjectId()
  Receipt.findById = (id) => ({
    select: () => Promise.resolve({ _id: receiptId, printCount: 0 }),
  })

  const updatedDoc = {
    _id: receiptId,
    receiptNo: 'SR-FIRST-PRINT',
    documentType: 'SALE_RECEIPT',
    referenceNo: 'SL-001',
    printCount: 1,
    firstPrintedAt: new Date(),
    lastPrintedAt: new Date(),
    populate: async () => updatedDoc,
  }
  Receipt.findByIdAndUpdate = () => updatedDoc

  let activityLogged = null
  ActivityLog.create = async (entries) => {
    activityLogged = entries[0]
    return entries
  }

  try {
    const res = await callRouter(receiptRouter, {
      method: 'POST',
      url: `/${receiptId}/printed`,
      body: { layout: 'THERMAL' },
      user: mockCashier,
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.receipt.printCount, 1)
    const log = activityLogs[activityLogs.length - 1]
    assert.ok(log)
    assert.equal(log.action, 'PRINT')
    assert.equal(log.details.printCount, 1)
    assert.equal(log.details.layout, 'THERMAL')
  } finally {
    Receipt.findById = origFindById
    Receipt.findByIdAndUpdate = origFindByIdAndUpdate
    ActivityLog.create = origActivityCreate
  }
})

test('POST /:id/print: alias increments printCount and logs REPRINT when printCount > 1', async () => {
  const origFindById = Receipt.findById
  const origFindByIdAndUpdate = Receipt.findByIdAndUpdate
  const origActivityCreate = ActivityLog.create

  const receiptId = new mongoose.Types.ObjectId()
  Receipt.findById = (id) => ({
    select: () => Promise.resolve({ _id: receiptId, printCount: 1 }),
  })

  const updatedDoc = {
    _id: receiptId,
    receiptNo: 'SR-REPRINT-1',
    documentType: 'SALE_RECEIPT',
    referenceNo: 'SL-002',
    printCount: 2,
    lastPrintedAt: new Date(),
    populate: async () => updatedDoc,
  }
  Receipt.findByIdAndUpdate = () => updatedDoc

  let activityLogged = null
  ActivityLog.create = async (entries) => {
    activityLogged = entries[0]
    return entries
  }

  try {
    const res = await callRouter(receiptRouter, {
      method: 'POST',
      url: `/${receiptId}/print`,
      body: { layout: 'A4' },
      user: mockManager,
    })

    assert.equal(res.status, 200)
    assert.equal(res.body.receipt.printCount, 2)
    const log = activityLogs[activityLogs.length - 1]
    assert.ok(log)
    assert.equal(log.action, 'REPRINT')
    assert.equal(log.details.printCount, 2)
  } finally {
    Receipt.findById = origFindById
    Receipt.findByIdAndUpdate = origFindByIdAndUpdate
    ActivityLog.create = origActivityCreate
  }
})
