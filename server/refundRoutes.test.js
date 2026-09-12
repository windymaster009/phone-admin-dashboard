import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import apiRouter from './routes.js'
import { ActivityLog, InventoryItem, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-refund-routes-12345'
mongoose.set('bufferCommands', false)

const testSessionId = 'refund-test-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00020'),
  name: 'Owner Alice',
  email: 'alice@shop.com',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00021'),
  name: 'Manager Bob',
  email: 'bob@shop.com',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00022'),
  name: 'Cashier Charlie',
  email: 'charlie@shop.com',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00023'),
  name: 'Stock Dave',
  email: 'dave@shop.com',
  role: 'STOCK',
  active: true,
}

let currentUser = mockOwner

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
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

test('Refund Routes RBAC: blocks unauthenticated requests with 401', async () => {
  const res = await callRouter(apiRouter, { method: 'GET', url: '/refunds', user: null })
  assert.equal(res.status, 401)

  const fakeId = new mongoose.Types.ObjectId()
  const resPost = await callRouter(apiRouter, { method: 'POST', url: `/trades/${fakeId}/refund`, user: null })
  assert.equal(resPost.status, 401)
})

test('Refund Routes RBAC: blocks CASHIER and STOCK roles with 403', async () => {
  const fakeId = new mongoose.Types.ObjectId()

  const resCashierGet = await callRouter(apiRouter, { method: 'GET', url: '/refunds', user: mockCashier })
  assert.equal(resCashierGet.status, 403)

  const resCashierPost = await callRouter(apiRouter, { method: 'POST', url: `/trades/${fakeId}/refund`, user: mockCashier })
  assert.equal(resCashierPost.status, 403)

  const resStockGet = await callRouter(apiRouter, { method: 'GET', url: '/refunds', user: mockStock })
  assert.equal(resStockGet.status, 403)

  const resStockPost = await callRouter(apiRouter, { method: 'POST', url: `/trades/${fakeId}/refund`, user: mockStock })
  assert.equal(resStockPost.status, 403)
})

test('GET /refunds: permits OWNER and returns filtered trades', async () => {
  const origFind = Trade.find
  const mockTrades = [
    { _id: new mongoose.Types.ObjectId(), tradeNo: 'SL-REF-1', type: 'SELL', status: 'COMPLETED' },
    { _id: new mongoose.Types.ObjectId(), tradeNo: 'SL-REF-2', type: 'SELL', status: 'RETURNED' },
  ]

  const queryMock = {
    populate: () => queryMock,
    sort: () => queryMock,
    limit: () => Promise.resolve(mockTrades),
  }
  Trade.find = () => queryMock

  try {
    const res = await callRouter(apiRouter, { method: 'GET', url: '/refunds', user: mockOwner })
    assert.equal(res.status, 200)
    assert.equal(res.body.trades.length, 2)
  } finally {
    Trade.find = origFind
  }
})

// ---------------------- POST /trades/:id/refund Tests ----------------------

test('POST /trades/:id/refund: rejects invalid MongoDB ObjectID with 400', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/trades/not-a-valid-id/refund',
    user: mockOwner,
  })
  assert.equal(res.status, 400)
  assert.match(res.body.message, /Sale transaction is invalid/i)
})

test('POST /trades/:id/refund: rejects non-existent trade with 404', async () => {
  const origFindById = Trade.findById
  Trade.findById = () => ({
    session: () => Promise.resolve(null),
  })

  try {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${fakeId}/refund`,
      user: mockOwner,
    })
    assert.equal(res.status, 404)
    assert.match(res.body.message, /Sale transaction was not found/i)
  } finally {
    Trade.findById = origFindById
  }
})

test('POST /trades/:id/refund: successfully executes full refund with RESTOCK for serialized phone and accessory', async () => {
  const origTradeFindById = Trade.findById
  const origInvFindById = InventoryItem.findById
  const origActivityCreate = ActivityLog.create

  const phoneItemId = new mongoose.Types.ObjectId()
  const accItemId = new mongoose.Types.ObjectId()

  const phoneDoc = {
    _id: phoneItemId,
    name: 'iPhone 15 Pro',
    category: 'PHONE',
    quantity: 0,
    status: 'SOLD',
    save: async function() { return this },
  }

  const accDoc = {
    _id: accItemId,
    name: 'USB-C Cable',
    category: 'ACCESSORY',
    quantity: 5,
    status: 'IN_STOCK',
    save: async function() { return this },
  }

  const tradeId = new mongoose.Types.ObjectId()
  const tradeDoc = {
    _id: tradeId,
    tradeNo: 'SL-FULL-REFUND-1',
    type: 'SELL',
    status: 'COMPLETED',
    transactionAmountPaid: 1200,
    amountPaid: 1200,
    currency: 'USD',
    paymentMethod: 'CASH',
    warrantyDays: 30,
    createdAt: new Date(),
    items: [
      { inventoryItem: phoneItemId, name: 'iPhone 15 Pro', quantity: 1 },
      { inventoryItem: accItemId, name: 'USB-C Cable', quantity: 2 },
    ],
    save: async function() { return this },
    populate: async function() { return this },
  }

  Trade.findById = () => ({
    session: () => Promise.resolve(tradeDoc),
  })

  InventoryItem.findById = (id) => ({
    session: () => Promise.resolve(id.toString() === phoneItemId.toString() ? phoneDoc : accDoc),
  })

  let loggedActivity = null
  ActivityLog.create = async (entries) => {
    loggedActivity = entries[0]
    return entries
  }

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: {
        reason: 'Customer returned sealed devices',
        confirmation: 'SL-FULL-REFUND-1',
        inventoryDisposition: 'RESTOCK',
      },
      user: mockOwner,
    })

    assert.equal(res.status, 200)
    assert.equal(tradeDoc.status, 'RETURNED')
    assert.equal(tradeDoc.refund.amount, 1200)
    assert.equal(tradeDoc.refund.inventoryDisposition, 'RESTOCK')
    assert.equal(tradeDoc.refund.reason, 'Customer returned sealed devices')

    // Serialized phone restored: qty = 1, status = IN_STOCK
    assert.equal(phoneDoc.quantity, 1)
    assert.equal(phoneDoc.status, 'IN_STOCK')

    // Quantity accessory restored: 5 + 2 = 7
    assert.equal(accDoc.quantity, 7)
    assert.equal(accDoc.status, 'IN_STOCK')

    // Activity log recorded
    assert.ok(loggedActivity)
    assert.equal(loggedActivity.action, 'REFUND')
    assert.equal(loggedActivity.entity, 'TRADE')
    assert.equal(loggedActivity.details.tradeNo, 'SL-FULL-REFUND-1')
    assert.equal(loggedActivity.details.amount, 1200)
    assert.equal(loggedActivity.details.inventoryDisposition, 'RESTOCK')
  } finally {
    Trade.findById = origTradeFindById
    InventoryItem.findById = origInvFindById
    ActivityLog.create = origActivityCreate
  }
})

test('POST /trades/:id/refund: executes refund with NO_RESTOCK without touching inventory', async () => {
  const origTradeFindById = Trade.findById
  const origInvFindById = InventoryItem.findById
  const origActivityCreate = ActivityLog.create

  let invFindCalled = false
  InventoryItem.findById = () => {
    invFindCalled = true
  }

  const tradeId = new mongoose.Types.ObjectId()
  const tradeDoc = {
    _id: tradeId,
    tradeNo: 'SL-NO-RESTOCK',
    type: 'SELL',
    status: 'COMPLETED',
    transactionAmountPaid: 50,
    amountPaid: 50,
    currency: 'USD',
    paymentMethod: 'CASH',
    warrantyDays: 14,
    createdAt: new Date(),
    items: [{ inventoryItem: new mongoose.Types.ObjectId(), name: 'Broken Case', quantity: 1 }],
    save: async function() { return this },
    populate: async function() { return this },
  }

  Trade.findById = () => ({
    session: () => Promise.resolve(tradeDoc),
  })
  ActivityLog.create = async () => []

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: {
        reason: 'Item smashed beyond repair',
        confirmation: 'SL-NO-RESTOCK',
        inventoryDisposition: 'NO_RESTOCK',
      },
      user: mockManager,
    })

    assert.equal(res.status, 200)
    assert.equal(tradeDoc.status, 'RETURNED')
    assert.equal(tradeDoc.refund.inventoryDisposition, 'NO_RESTOCK')
    assert.equal(invFindCalled, false) // InventoryItem was never queried or altered
  } finally {
    Trade.findById = origTradeFindById
    InventoryItem.findById = origInvFindById
    ActivityLog.create = origActivityCreate
  }
})

test('POST /trades/:id/refund: rejects repeated refund with 409', async () => {
  const origTradeFindById = Trade.findById

  const tradeId = new mongoose.Types.ObjectId()
  const tradeDoc = {
    _id: tradeId,
    tradeNo: 'SL-ALREADY-REFUNDED',
    type: 'SELL',
    status: 'RETURNED', // already returned
    transactionAmountPaid: 100,
    amountPaid: 100,
    warrantyDays: 14,
    createdAt: new Date(),
  }

  Trade.findById = () => ({
    session: () => Promise.resolve(tradeDoc),
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: {
        reason: 'Second return attempt',
        confirmation: 'SL-ALREADY-REFUNDED',
        inventoryDisposition: 'RESTOCK',
      },
      user: mockOwner,
    })

    assert.equal(res.status, 409)
    assert.match(res.body.message, /already been refunded/i)
  } finally {
    Trade.findById = origTradeFindById
  }
})

test('POST /trades/:id/refund: rejects buy transaction with 409 and non-completed sale with 409', async () => {
  const origTradeFindById = Trade.findById

  const buyTradeId = new mongoose.Types.ObjectId()
  Trade.findById = () => ({
    session: () => Promise.resolve({
      _id: buyTradeId,
      tradeNo: 'BY-001',
      type: 'BUY',
      status: 'COMPLETED',
    }),
  })

  try {
    const resBuy = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${buyTradeId}/refund`,
      body: { reason: 'Refund buy transaction', confirmation: 'BY-001', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })
    assert.equal(resBuy.status, 409)
    assert.match(resBuy.body.message, /Only sale transactions can be refunded/i)

    // Non-completed sale
    const pendingTradeId = new mongoose.Types.ObjectId()
    Trade.findById = () => ({
      session: () => Promise.resolve({
        _id: pendingTradeId,
        tradeNo: 'SL-PENDING',
        type: 'SELL',
        status: 'PENDING',
      }),
    })

    const resPending = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${pendingTradeId}/refund`,
      body: { reason: 'Refund pending transaction', confirmation: 'SL-PENDING', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })
    assert.equal(resPending.status, 409)
    assert.match(resPending.body.message, /Only completed sales can be refunded/i)
  } finally {
    Trade.findById = origTradeFindById
  }
})

test('POST /trades/:id/refund: rejects expired warranty (409) and 0 warranty days (409)', async () => {
  const origTradeFindById = Trade.findById

  const expiredId = new mongoose.Types.ObjectId()
  Trade.findById = () => ({
    session: () => Promise.resolve({
      _id: expiredId,
      tradeNo: 'SL-EXP-WARRANTY',
      type: 'SELL',
      status: 'COMPLETED',
      warrantyDays: 7,
      warrantyExpiresAt: new Date(Date.now() - 86400000), // expired yesterday
      createdAt: new Date(Date.now() - 864000000),
    }),
  })

  try {
    const resExp = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${expiredId}/refund`,
      body: { reason: 'Customer returned after warranty', confirmation: 'SL-EXP-WARRANTY', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })
    assert.equal(resExp.status, 409)
    assert.match(resExp.body.message, /warranty expired/i)

    // Zero warranty
    const noWarrantyId = new mongoose.Types.ObjectId()
    Trade.findById = () => ({
      session: () => Promise.resolve({
        _id: noWarrantyId,
        tradeNo: 'SL-NO-WARRANTY',
        type: 'SELL',
        status: 'COMPLETED',
        warrantyDays: 0,
        createdAt: new Date(),
      }),
    })

    const resNoWar = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${noWarrantyId}/refund`,
      body: { reason: 'Customer wants refund anyway', confirmation: 'SL-NO-WARRANTY', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })
    assert.equal(resNoWar.status, 409)
    assert.match(resNoWar.body.message, /without a refund warranty/i)
  } finally {
    Trade.findById = origTradeFindById
  }
})

test('POST /trades/:id/refund: validates confirmation match and reason length (400)', async () => {
  const origTradeFindById = Trade.findById

  const tradeId = new mongoose.Types.ObjectId()
  Trade.findById = () => ({
    session: () => Promise.resolve({
      _id: tradeId,
      tradeNo: 'SL-VALIDATE-1',
      type: 'SELL',
      status: 'COMPLETED',
      warrantyDays: 14,
      createdAt: new Date(),
    }),
  })

  try {
    // Too short reason (< 5 characters)
    const resShortReason = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: { reason: 'Bad', confirmation: 'SL-VALIDATE-1', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })
    assert.equal(resShortReason.status, 400)
    assert.match(resShortReason.body.message, /at least 5 characters/i)

    // Mismatched confirmation
    const resBadConfirm = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: { reason: 'Valid refund reason', confirmation: 'WRONG-NO', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })
    assert.equal(resBadConfirm.status, 400)
    assert.match(resBadConfirm.body.message, /Type SL-VALIDATE-1 to confirm/i)

    // Invalid disposition
    const resBadDisp = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: { reason: 'Valid refund reason', confirmation: 'SL-VALIDATE-1', inventoryDisposition: 'MAYBE' },
      user: mockOwner,
    })
    assert.equal(resBadDisp.status, 400)
    assert.match(resBadDisp.body.message, /Choose whether returned items should be restored/i)
  } finally {
    Trade.findById = origTradeFindById
  }
})

test('POST /trades/:id/refund: rejects phone restock if phone was modified/restocked already (409)', async () => {
  const origTradeFindById = Trade.findById
  const origInvFindById = InventoryItem.findById

  const phoneItemId = new mongoose.Types.ObjectId()
  const tradeId = new mongoose.Types.ObjectId()

  // Phone item has quantity 1 (already restocked or someone else added stock)
  const phoneDoc = {
    _id: phoneItemId,
    name: 'iPhone 15 Pro',
    category: 'PHONE',
    quantity: 1, // should be 0 for SOLD phone
    status: 'IN_STOCK',
  }

  Trade.findById = () => ({
    session: () => Promise.resolve({
      _id: tradeId,
      tradeNo: 'SL-PHONE-MOD',
      type: 'SELL',
      status: 'COMPLETED',
      transactionAmountPaid: 999,
      amountPaid: 999,
      warrantyDays: 30,
      createdAt: new Date(),
      items: [{ inventoryItem: phoneItemId, name: 'iPhone 15 Pro', quantity: 1 }],
    }),
  })

  InventoryItem.findById = () => ({
    session: () => Promise.resolve(phoneDoc),
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/trades/${tradeId}/refund`,
      body: { reason: 'Customer returned phone', confirmation: 'SL-PHONE-MOD', inventoryDisposition: 'RESTOCK' },
      user: mockOwner,
    })

    assert.equal(res.status, 409)
    assert.match(res.body.message, /no longer matches its sold inventory state/i)
  } finally {
    Trade.findById = origTradeFindById
    InventoryItem.findById = origInvFindById
  }
})
