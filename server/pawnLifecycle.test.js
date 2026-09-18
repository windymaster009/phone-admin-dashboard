import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import apiRouter from './routes.js'
import { ActivityLog, Customer, InventoryItem, Pawn, User } from './models.js'
import { CustomerDocument } from './documentModels.js'
import { Receipt } from './receiptModels.js'
import { AuthSession } from './authSessionModels.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-pawn-lifecycle'
mongoose.set('bufferCommands', false)

const testSessionId = 'pawn-lifecycle-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00040'),
  name: 'Owner Alice',
  email: 'owner@phoneflow.test',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00041'),
  name: 'Manager Bob',
  email: 'manager@phoneflow.test',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00042'),
  name: 'Cashier Charlie',
  email: 'cashier@phoneflow.test',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00043'),
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
const origMongooseTransaction = mongoose.connection.transaction
const origStartSession = mongoose.startSession
const origPawnUpdateMany = Pawn.updateMany
const origPawnFind = Pawn.find
const origReceiptDeleteMany = Receipt.deleteMany

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
  mongoose.connection.transaction = async (callback) => {
    return callback({
      session() { return this },
    })
  }
  mongoose.startSession = async () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {},
  })
  Pawn.updateMany = async () => ({ acknowledged: true, modifiedCount: 0 })
  Pawn.find = () => {
    const q = {
      populate() { return q },
      sort() { return q },
      limit() { return Promise.resolve([]) },
      then(resolve) { return Promise.resolve([]).then(resolve) },
    }
    return q
  }
  Receipt.deleteMany = async () => ({ acknowledged: true })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  ActivityLog.prototype.save = origActivityLogSave
  User.findById = origUserFindById
  mongoose.connection.transaction = origMongooseTransaction
  mongoose.startSession = origStartSession
  Pawn.updateMany = origPawnUpdateMany
  Pawn.find = origPawnFind
  Receipt.deleteMany = origReceiptDeleteMany
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
        resolve({ status: code, body: { message: err.message, stack: err.stack }, error: err })
      } else {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders })
      }
    })
  })
}

// ---------------------------------------------------------------------------
// 1. Role Restrictions
// ---------------------------------------------------------------------------

test('Pawn server roles: CASHIER and STOCK cannot create pawns (403)', async () => {
  const resCashier = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockCashier,
    body: {},
  })
  assert.equal(resCashier.status, 403)

  const resStock = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockStock,
    body: {},
  })
  assert.equal(resStock.status, 403)
})

test('Pawn server roles: CASHIER cannot forfeit pawns (403)', async () => {
  const pawnId = new mongoose.Types.ObjectId().toString()
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: `/pawns/${pawnId}/forfeit`,
    user: mockCashier,
  })
  assert.equal(res.status, 403)
})

test('Pawn server roles: MANAGER cannot delete pawns (403)', async () => {
  const pawnId = new mongoose.Types.ObjectId().toString()
  const res = await callRouter(apiRouter, {
    method: 'DELETE',
    url: `/pawns/${pawnId}`,
    user: mockManager,
  })
  assert.equal(res.status, 403)
})

test('Pawn server roles: STOCK cannot perform any pawn action (403)', async () => {
  const pawnId = new mongoose.Types.ObjectId().toString()

  const resList = await callRouter(apiRouter, { method: 'GET', url: '/pawns', user: mockStock })
  assert.equal(resList.status, 403)

  const resPay = await callRouter(apiRouter, { method: 'POST', url: `/pawns/${pawnId}/payment`, user: mockStock })
  assert.equal(resPay.status, 403)

  const resRedeem = await callRouter(apiRouter, { method: 'POST', url: `/pawns/${pawnId}/redeem`, user: mockStock })
  assert.equal(resRedeem.status, 403)
})

// ---------------------------------------------------------------------------
// 2. Creation Validation
// ---------------------------------------------------------------------------

test('Pawn creation: rejects missing customer or item (400)', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: { itemSnapshot: {} },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('Customer and item are required'))
})

test('Pawn creation: rejects missing new customer name (400)', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: {
      customerDetails: { phone: '012345678' },
      itemSnapshot: { name: 'iPhone 13' },
    },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('New customer name is required'))
})

test('Pawn creation: rejects non-existent existing customer (404)', async () => {
  const origCustomerFindById = Customer.findById
  Customer.findById = () => ({ select: async () => null })

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: '/pawns',
      user: mockOwner,
      body: {
        customer: new mongoose.Types.ObjectId().toString(),
        itemSnapshot: { name: 'iPhone 13' },
      },
    })
    assert.equal(res.status, 404)
    assert.ok(res.body.message.includes('Customer not found'))
  } finally {
    Customer.findById = origCustomerFindById
  }
})
test('Pawn creation: rejects unconfirmed ownership / identity (400)', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: {
      customerDetails: { name: 'Dara Sok' },
      itemSnapshot: { name: 'iPhone 13' },
      ownershipConfirmed: false,
      identificationVerified: false,
    },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('Confirm the customer identity and collateral ownership'))
})

test('Pawn creation: rejects invalid IMEI (must be exactly 15 digits) (400)', async () => {
  const resShort = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: {
      customerDetails: { name: 'Dara Sok', nationalIdNumber: 'ID-123' },
      ownershipConfirmed: true,
      itemSnapshot: { name: 'iPhone 13', imei: '12345678' },
      principal: 100,
      estimatedValue: 250,
      termDays: 7,
    },
  })
  assert.equal(resShort.status, 400)
  assert.ok(resShort.body.message.includes('IMEI must contain exactly 15 digits'))

  const resChars = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: {
      customerDetails: { name: 'Dara Sok', nationalIdNumber: 'ID-123' },
      ownershipConfirmed: true,
      itemSnapshot: { name: 'iPhone 13', imei: '12345678901234a' },
      principal: 100,
      estimatedValue: 250,
      termDays: 7,
    },
  })
  assert.equal(resChars.status, 400)
  assert.ok(resChars.body.message.includes('IMEI must contain exactly 15 digits'))
})

test('Pawn creation: rejects principal exceeding valuation percentage limit (400)', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: {
      customerDetails: { name: 'Dara Sok', nationalIdNumber: 'ID-123' },
      ownershipConfirmed: true,
      itemSnapshot: { name: 'iPhone 13', imei: '123456789012345' },
      currency: 'USD',
      estimatedValue: 200,
      pawnPercentage: 50,
      principal: 100.05, // 50% of 200 is 100
      termDays: 7,
    },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('valuation limit'))
})

test('Pawn creation: rejects invalid term days (not 3, 7, 15, 30) (400)', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/pawns',
    user: mockOwner,
    body: {
      customerDetails: { name: 'Dara Sok', nationalIdNumber: 'ID-123' },
      ownershipConfirmed: true,
      itemSnapshot: { name: 'iPhone 13', imei: '123456789012345' },
      currency: 'USD',
      estimatedValue: 200,
      pawnPercentage: 50,
      principal: 80,
      termDays: 10, // invalid term
    },
  })
  assert.equal(res.status, 400)
  assert.ok(res.body.message.includes('Pawn term must be 3, 7, 15, or 30 days'))
})

test('Pawn creation: successfully creates customer, collateral inventory item, and pawn contract', async () => {
  const origCustomerCreate = Customer.create
  const origItemCreate = InventoryItem.create
  const origPawnCreate = Pawn.create

  let createdCustomer = null
  let createdItem = null
  let createdPawn = null

  Customer.create = async (items) => {
    createdCustomer = { _id: new mongoose.Types.ObjectId(), ...items[0] }
    return [createdCustomer]
  }

  InventoryItem.create = async (items) => {
    createdItem = { _id: new mongoose.Types.ObjectId(), ...items[0] }
    return [createdItem]
  }

  Pawn.create = async (items) => {
    createdPawn = {
      _id: new mongoose.Types.ObjectId(),
      status: 'ACTIVE',
      ...items[0],
      populate: async (field) => {
        if (field === 'customer') {
          createdPawn.customer = createdCustomer
        } else if (field === 'inventoryItem') {
          createdPawn.inventoryItem = createdItem
        }
        return createdPawn
      },
      toObject: () => ({ ...createdPawn }),
    }
    return [createdPawn]
  }

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: '/pawns',
      user: mockOwner,
      body: {
        customerDetails: { name: 'Visal Chan', phone: '012 999 888', nationalIdNumber: 'ID-888', address: 'Phnom Penh' },
        itemSnapshot: {
          name: 'Samsung S22',
          brand: 'Samsung',
          model: 'Galaxy S22',
          imei: '358901234567890',
          storage: '128',
        },
        estimatedValue: 300,
        pawnPercentage: 45,
        principal: 135,
        currency: 'USD',
        termDays: 7,
        ownershipConfirmed: true,
      },
    })
    assert.equal(res.status, 201)
    assert.ok(createdCustomer)
    assert.equal(createdCustomer.name, 'Visal Chan')

    assert.ok(createdItem)
    assert.equal(createdItem.status, 'PAWNED')
    assert.equal(createdItem.category, 'PHONE')
    assert.equal(createdItem.buyPrice, 135)
    assert.equal(createdItem.sellPrice, 300)

    assert.ok(createdPawn)
    assert.equal(createdPawn.status, 'ACTIVE')
    assert.equal(createdPawn.workflowVersion, 5)
    assert.equal(createdPawn.feeModel, 'DAILY_SIMPLE')
    assert.equal(createdPawn.termDays, 7)
    assert.equal(createdPawn.principal, 135)
    assert.equal(createdPawn.gracePeriodDays, 5)
    assert.equal(createdPawn.graceEndsAt.getTime(), createdPawn.dueDate.getTime() + 5 * 86400000)

    // Verify linked inventory item details returned immediately in creation response
    // Physical phone label uses PWN SKU as the barcode, NOT the pawn contract number PW-...
    assert.equal(createdItem.barcode, createdItem.sku)
    assert.match(createdItem.sku, /^PWN-/)
    assert.match(createdPawn.pawnNo, /^PW-/)
    assert.notEqual(createdItem.barcode, createdPawn.pawnNo)
    assert.equal(createdPawn.itemSnapshot?.sku, createdItem.sku)
    assert.ok(res.body.pawn.inventoryItem)
    assert.equal(typeof res.body.pawn.inventoryItem, 'object')
    assert.equal(res.body.pawn.inventoryItem.barcode, createdItem.sku)
    assert.equal(res.body.pawn.inventoryItem.sku, createdItem.sku)
    assert.equal(res.body.pawn.inventoryItem.name, 'Samsung S22')
    assert.equal(res.body.pawn.inventoryItem.status, 'PAWNED')
  } finally {
    Customer.create = origCustomerCreate
    InventoryItem.create = origItemCreate
    Pawn.create = origPawnCreate
  }
})
// ---------------------------------------------------------------------------
// 3. Pawn Listing Customer Redaction
// ---------------------------------------------------------------------------

test('Pawn list: CASHIER role redacts customer nationalIdNumber', async () => {
  let populateFieldsCalled = null
  Pawn.find = (query) => {
    if (query?.dueDate && query?.status?.$in) {
      return {
        populate: () => Promise.resolve([]),
        then(resolve) { resolve([]) },
      }
    }
    const chain = {
      populate(field, projection) {
        if (field === 'customer') {
          populateFieldsCalled = projection
        }
        return chain
      },
      sort() { return chain },
      limit() { return Promise.resolve([]) },
    }
    return chain
  }

  try {
    const resCashier = await callRouter(apiRouter, { method: 'GET', url: '/pawns', user: mockCashier })
    assert.equal(resCashier.status, 200)
    assert.equal(populateFieldsCalled, 'name phone')

    populateFieldsCalled = null
    const resOwner = await callRouter(apiRouter, { method: 'GET', url: '/pawns', user: mockOwner })
    assert.equal(resOwner.status, 200)
    assert.equal(populateFieldsCalled, 'name phone nationalIdNumber')
  } finally {
    Pawn.find = origPawnFind
  }
})

// ---------------------------------------------------------------------------
// 4. Pawn Fee Payment Allocation
// ---------------------------------------------------------------------------

test('Pawn payment: pays accrued fee without altering remainingPrincipal', async () => {
  const origPawnFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-FEE-PAY',
    status: 'ACTIVE',
    currency: 'USD',
    remainingPrincipal: 100,
    dailyFeeRate: 2.5,
    feeModel: 'DAILY_SIMPLE',
    termDays: 7,
    startDate: new Date(Date.now() - 3 * 86400000),
    currentTermStartDate: new Date(Date.now() - 3 * 86400000),
    feeAccrualStartedAt: new Date(Date.now() - 3 * 86400000),
    dueDate: new Date(Date.now() + 4 * 86400000),
    accruedPawnFee: 0,
    fees: 0,
    amountPaid: 0,
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => fakePawn,
    toObject: () => ({ ...fakePawn }),
  }
  Pawn.findById = () => fakePawn

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/payment`,
      user: mockCashier,
      body: { note: 'Regular fee payment' },
    })
    assert.equal(res.status, 200)
    // Remaining principal must NOT be touched
    assert.equal(fakePawn.remainingPrincipal, 100)
    // Fee was paid, amountPaid incremented
    assert.ok(fakePawn.amountPaid > 0)
    assert.equal(fakePawn.accruedPawnFee, 0)
  } finally {
    Pawn.findById = origPawnFindById
  }
})

// ---------------------------------------------------------------------------
// 5. Pawn Redemption & Collateral State
// ---------------------------------------------------------------------------

test('Pawn redemption: rejects payment less than outstanding balance (400)', async () => {
  const origPawnFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  const now = new Date()
  const fakePawn = {
    _id: pawnId,
    status: 'ACTIVE',
    currency: 'USD',
    remainingPrincipal: 200,
    accruedInterest: 0,
    accruedPawnFee: 10,
    fees: 0,
    dailyFeeRate: 2.5,
    feeModel: 'DAILY_SIMPLE',
    startDate: now,
    currentTermStartDate: now,
    feeAccrualStartedAt: now,
    dueDate: new Date(Date.now() + 7 * 86400000),
    session() { return this },
    populate: async () => fakePawn,
  }
  Pawn.findById = () => fakePawn

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/redeem`,
      user: mockCashier,
      body: { amount: 150 }, // Outstanding is > 200
    })
    assert.equal(res.status, 400)
    assert.ok(res.body.message.includes('Redemption amount cannot be less than the outstanding balance'))
  } finally {
    Pawn.findById = origPawnFindById
  }
})

test('Pawn redemption: full payment marks REDEEMED and archives inventory item (ARCHIVED, qty 0)', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  const pawnId = new mongoose.Types.ObjectId().toString()
  const inventoryItemId = new mongoose.Types.ObjectId().toString()

  let itemUpdatePayload = null
  InventoryItem.findByIdAndUpdate = async (id, update) => {
    itemUpdatePayload = update
    return { _id: id }
  }

  const now = new Date()
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-REDEEM-OK',
    status: 'ACTIVE',
    currency: 'USD',
    remainingPrincipal: 200,
    accruedPawnFee: 0,
    fees: 0,
    dailyFeeRate: 0,
    feeModel: 'DAILY_SIMPLE',
    startDate: now,
    currentTermStartDate: now,
    feeAccrualStartedAt: now,
    dueDate: new Date(Date.now() + 7 * 86400000),
    inventoryItem: inventoryItemId,
    payments: [],
    session() { return this },
    populate: async () => fakePawn,
    save: async () => fakePawn,
    toObject: () => ({ ...fakePawn }),
  }
  Pawn.findById = () => fakePawn

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/redeem`,
      user: mockCashier,
      body: { amount: 200 },
    })
    assert.equal(res.status, 200)
    assert.equal(fakePawn.status, 'REDEEMED')
    assert.equal(fakePawn.remainingPrincipal, 0)
    assert.ok(fakePawn.redeemedAt)

    // Collateral inventory item must be ARCHIVED with quantity 0
    assert.ok(itemUpdatePayload)
    assert.equal(itemUpdatePayload.status, 'ARCHIVED')
    assert.equal(itemUpdatePayload.quantity, 0)
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

// ---------------------------------------------------------------------------
// 6. Pawn Forfeiture / Collateral Claim
// ---------------------------------------------------------------------------

test('Pawn forfeiture: rejects non-overdue pawn contracts (409)', async () => {
  const origPawnFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  Pawn.findById = () => ({
    _id: pawnId,
    status: 'ACTIVE',
    session() { return this },
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('Only overdue pawn collateral can be claimed'))
  } finally {
    Pawn.findById = origPawnFindById
  }
})

test('Pawn forfeiture: rejects overdue pawn before grace period ends (409)', async () => {
  const origPawnFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  // Due yesterday, grace ends in 4 days
  Pawn.findById = () => ({
    _id: pawnId,
    status: 'OVERDUE',
    dueDate: new Date(Date.now() - 86400000),
    graceEndsAt: new Date(Date.now() + 4 * 86400000),
    session() { return this },
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('cannot be claimed until'))
  } finally {
    Pawn.findById = origPawnFindById
  }
})

test('Pawn forfeiture: past grace period transfers collateral into second-hand stock (IN_STOCK, PAWN_FORFEIT)', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  const pawnId = new mongoose.Types.ObjectId().toString()
  const inventoryItemId = new mongoose.Types.ObjectId().toString()

  let itemUpdatePayload = null
  InventoryItem.findByIdAndUpdate = async (id, update) => {
    itemUpdatePayload = update
    return { _id: id }
  }

  // Due 10 days ago, grace period ended 5 days ago
  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-FORFEIT-1',
    status: 'OVERDUE',
    currency: 'USD',
    principal: 150,
    originalPrincipal: 150,
    estimatedValue: 300,
    dueDate: new Date(Date.now() - 10 * 86400000),
    graceEndsAt: new Date(Date.now() - 5 * 86400000),
    inventoryItem: inventoryItemId,
    session() { return this },
    save: async () => fakePawn,
    toObject: () => ({ ...fakePawn }),
  }
  Pawn.findById = () => fakePawn

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
      body: { sellPrice: 280 },
    })
    assert.equal(res.status, 200)
    assert.equal(fakePawn.status, 'FORFEITED')
    assert.ok(fakePawn.forfeitedAt)

    // Verify collateral was moved to active stock
    assert.ok(itemUpdatePayload)
    assert.equal(itemUpdatePayload.status, 'IN_STOCK')
    assert.equal(itemUpdatePayload.source, 'PAWN_FORFEIT')
    assert.equal(itemUpdatePayload.quantity, 1)
    assert.equal(itemUpdatePayload.buyPrice, 150)
    assert.equal(itemUpdatePayload.sellPrice, 280)
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

test('Pawn forfeiture timing: rejects claim before 5 full days have passed (409)', async () => {
  const origPawnFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()
  const now = Date.now()
  const dueDate = new Date(now - 4 * 86400000)

  Pawn.findById = () => ({
    _id: pawnId,
    status: 'OVERDUE',
    dueDate,
    graceEndsAt: new Date(dueDate.getTime() + 5 * 86400000),
    session() { return this },
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('cannot be claimed until'))
  } finally {
    Pawn.findById = origPawnFindById
  }
})

test('Pawn forfeiture timing: allows claim exactly at 5 full days', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  InventoryItem.findByIdAndUpdate = async (id) => ({ _id: id })
  const pawnId = new mongoose.Types.ObjectId().toString()
  const now = Date.now()
  const dueDate = new Date(now - 5 * 86400000)

  const fakePawn = {
    _id: pawnId,
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    dueDate,
    graceEndsAt: new Date(dueDate.getTime() + 5 * 86400000),
    session() { return this },
    save: async () => fakePawn,
    toObject: () => ({ ...fakePawn }),
  }
  Pawn.findById = () => fakePawn

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.equal(fakePawn.status, 'FORFEITED')
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

test('Pawn forfeiture timing: allows claim after 5 full days', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  InventoryItem.findByIdAndUpdate = async (id) => ({ _id: id })
  const pawnId = new mongoose.Types.ObjectId().toString()
  const now = Date.now()
  const dueDate = new Date(now - 6 * 86400000)

  const fakePawn = {
    _id: pawnId,
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    dueDate,
    graceEndsAt: new Date(dueDate.getTime() + 5 * 86400000),
    session() { return this },
    save: async () => fakePawn,
    toObject: () => ({ ...fakePawn }),
  }
  Pawn.findById = () => fakePawn

  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.equal(fakePawn.status, 'FORFEITED')
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

test('Pawn forfeiture timing: older contract with 2-day graceEndsAt enforces 5-day minimum (before, exactly at, and after)', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  InventoryItem.findByIdAndUpdate = async (id) => ({ _id: id })
  const pawnId = new mongoose.Types.ObjectId().toString()
  const now = Date.now()

  // 1. Before: 3 days overdue (2-day grace passed, but 5-day minimum has not)
  const dueDateBefore = new Date(now - 3 * 86400000)
  const graceEndsAt2Day = new Date(dueDateBefore.getTime() + 2 * 86400000)
  Pawn.findById = () => ({
    _id: pawnId,
    status: 'OVERDUE',
    dueDate: dueDateBefore,
    graceEndsAt: graceEndsAt2Day,
    session() { return this },
  })

  try {
    const resBefore = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(resBefore.status, 409)
    assert.ok(resBefore.body.message.includes('cannot be claimed until'))
  } finally {
    Pawn.findById = origPawnFindById
  }

  // 2. Exactly at: 5 days overdue (reaches 5-day minimum)
  const dueDateExact = new Date(now - 5 * 86400000)
  const fakePawnExact = {
    _id: pawnId,
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    dueDate: dueDateExact,
    graceEndsAt: new Date(dueDateExact.getTime() + 2 * 86400000),
    session() { return this },
    save: async () => fakePawnExact,
    toObject: () => ({ ...fakePawnExact }),
  }
  Pawn.findById = () => fakePawnExact

  try {
    const resExact = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(resExact.status, 200)
    assert.equal(fakePawnExact.status, 'FORFEITED')
  } finally {
    Pawn.findById = origPawnFindById
  }

  // 3. After: 6 days overdue
  const dueDateAfter = new Date(now - 6 * 86400000)
  const fakePawnAfter = {
    _id: pawnId,
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    dueDate: dueDateAfter,
    graceEndsAt: new Date(dueDateAfter.getTime() + 2 * 86400000),
    session() { return this },
    save: async () => fakePawnAfter,
    toObject: () => ({ ...fakePawnAfter }),
  }
  Pawn.findById = () => fakePawnAfter

  try {
    const resAfter = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(resAfter.status, 200)
    assert.equal(fakePawnAfter.status, 'FORFEITED')
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

test('Pawn forfeiture timing: honors later saved graceEndsAt (before, exactly at, and after)', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  InventoryItem.findByIdAndUpdate = async (id) => ({ _id: id })
  const pawnId = new mongoose.Types.ObjectId().toString()
  const now = Date.now()

  // 1. Before: 6 days overdue (past 5-day minimum, but before 7-day graceEndsAt)
  const dueDateBefore = new Date(now - 6 * 86400000)
  const graceEndsAt7Day = new Date(dueDateBefore.getTime() + 7 * 86400000)
  Pawn.findById = () => ({
    _id: pawnId,
    status: 'OVERDUE',
    dueDate: dueDateBefore,
    graceEndsAt: graceEndsAt7Day,
    session() { return this },
  })

  try {
    const resBefore = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(resBefore.status, 409)
    assert.ok(resBefore.body.message.includes('cannot be claimed until'))
  } finally {
    Pawn.findById = origPawnFindById
  }

  // 2. Exactly at: 7 days overdue (reaches 7-day graceEndsAt)
  const dueDateExact = new Date(now - 7 * 86400000)
  const fakePawnExact = {
    _id: pawnId,
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    dueDate: dueDateExact,
    graceEndsAt: new Date(dueDateExact.getTime() + 7 * 86400000),
    session() { return this },
    save: async () => fakePawnExact,
    toObject: () => ({ ...fakePawnExact }),
  }
  Pawn.findById = () => fakePawnExact

  try {
    const resExact = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(resExact.status, 200)
    assert.equal(fakePawnExact.status, 'FORFEITED')
  } finally {
    Pawn.findById = origPawnFindById
  }

  // 3. After: 8 days overdue
  const dueDateAfter = new Date(now - 8 * 86400000)
  const fakePawnAfter = {
    _id: pawnId,
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    dueDate: dueDateAfter,
    graceEndsAt: new Date(dueDateAfter.getTime() + 7 * 86400000),
    session() { return this },
    save: async () => fakePawnAfter,
    toObject: () => ({ ...fakePawnAfter }),
  }
  Pawn.findById = () => fakePawnAfter

  try {
    const resAfter = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockOwner,
    })
    assert.equal(resAfter.status, 200)
    assert.equal(fakePawnAfter.status, 'FORFEITED')
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

test('Pawn redemption and claim separation: cashier can redeem overdue contract but cannot claim collateral', async () => {
  const origPawnFindById = Pawn.findById
  const origItemUpdate = InventoryItem.findByIdAndUpdate
  InventoryItem.findByIdAndUpdate = async (id) => ({ _id: id })
  const pawnId = new mongoose.Types.ObjectId().toString()
  const inventoryItemId = new mongoose.Types.ObjectId().toString()

  const fakePawn = {
    _id: pawnId,
    pawnNo: 'PW-SEPARATE-1',
    status: 'OVERDUE',
    currency: 'USD',
    principal: 100,
    remainingPrincipal: 100,
    accruedInterest: 10,
    fees: 5,
    dueDate: new Date(Date.now() - 10 * 86400000),
    graceEndsAt: new Date(Date.now() - 5 * 86400000),
    inventoryItem: inventoryItemId,
    payments: [],
    session() { return this },
    save: async () => fakePawn,
    populate: async () => fakePawn,
    toObject: () => ({ ...fakePawn }),
  }
  Pawn.findById = () => fakePawn

  try {
    const resClaim = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/forfeit`,
      user: mockCashier,
    })
    assert.equal(resClaim.status, 403)

    const resRedeem = await callRouter(apiRouter, {
      method: 'POST',
      url: `/pawns/${pawnId}/redeem`,
      user: mockCashier,
      body: { amount: 115 },
    })
    assert.equal(resRedeem.status, 200)
    assert.equal(fakePawn.status, 'REDEEMED')
  } finally {
    Pawn.findById = origPawnFindById
    InventoryItem.findByIdAndUpdate = origItemUpdate
  }
})

// ---------------------------------------------------------------------------
// 7. Pawn Deletion
// ---------------------------------------------------------------------------

test('Pawn deletion: rejects contract with payments or extensions (409)', async () => {
  const origPawnFindById = Pawn.findById
  const pawnId = new mongoose.Types.ObjectId().toString()

  // 1. Has payments
  Pawn.findById = async () => ({
    _id: pawnId,
    status: 'ACTIVE',
    amountPaid: 50,
    payments: [{ amount: 50 }],
  })
  try {
    const resPaid = await callRouter(apiRouter, {
      method: 'DELETE',
      url: `/pawns/${pawnId}`,
      user: mockOwner,
    })
    assert.equal(resPaid.status, 409)
    assert.ok(resPaid.body.message.includes('Only an untouched open pawn contract can be deleted'))

    // 2. Has renewals
    Pawn.findById = async () => ({
      _id: pawnId,
      status: 'ACTIVE',
      amountPaid: 0,
      payments: [],
      renewals: [{ termDays: 7 }],
    })
    const resRenewed = await callRouter(apiRouter, {
      method: 'DELETE',
      url: `/pawns/${pawnId}`,
      user: mockOwner,
    })
    assert.equal(resRenewed.status, 409)
    assert.ok(resRenewed.body.message.includes('Only an untouched open pawn contract can be deleted'))
  } finally {
    Pawn.findById = origPawnFindById
  }
})

test('Pawn deletion: rejects contract with attached secure documents (409)', async () => {
  const origPawnFindById = Pawn.findById
  const origDocCount = CustomerDocument.countDocuments
  const pawnId = new mongoose.Types.ObjectId().toString()

  Pawn.findById = async () => ({
    _id: pawnId,
    status: 'ACTIVE',
    amountPaid: 0,
    payments: [],
    renewals: [],
  })
  CustomerDocument.countDocuments = async () => 2 // 2 documents attached

  try {
    const res = await callRouter(apiRouter, {
      method: 'DELETE',
      url: `/pawns/${pawnId}`,
      user: mockOwner,
    })
    assert.equal(res.status, 409)
    assert.ok(res.body.message.includes('Delete the secure documents linked to this pawn'))
  } finally {
    Pawn.findById = origPawnFindById
    CustomerDocument.countDocuments = origDocCount
  }
})

test('Pawn deletion: successfully deletes untouched open contract and inventory item', async () => {
  const origPawnFindById = Pawn.findById
  const origDocCount = CustomerDocument.countDocuments
  const origPawnDeleteOne = Pawn.deleteOne
  const origItemDeleteOne = InventoryItem.deleteOne
  const pawnId = new mongoose.Types.ObjectId().toString()
  const itemId = new mongoose.Types.ObjectId().toString()

  let pawnDeleted = false
  let itemDeleted = false

  Pawn.findById = async () => ({
    _id: pawnId,
    pawnNo: 'PW-DEL-CLEAN',
    status: 'ACTIVE',
    amountPaid: 0,
    payments: [],
    renewals: [],
    inventoryItem: itemId,
  })
  CustomerDocument.countDocuments = async () => 0
  Pawn.deleteOne = async () => { pawnDeleted = true }
  InventoryItem.deleteOne = async () => { itemDeleted = true }

  try {
    const res = await callRouter(apiRouter, {
      method: 'DELETE',
      url: `/pawns/${pawnId}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.deleted, true)
    assert.equal(pawnDeleted, true)
    assert.equal(itemDeleted, true)
  } finally {
    Pawn.findById = origPawnFindById
    CustomerDocument.countDocuments = origDocCount
    Pawn.deleteOne = origPawnDeleteOne
    InventoryItem.deleteOne = origItemDeleteOne
  }
})

test('Inventory scan: resolves collateral item and related pawn when scanning pawnNo barcode', async () => {
  const origItemFindOne = InventoryItem.findOne
  const origPawnFindOne = Pawn.findOne
  const itemId = new mongoose.Types.ObjectId()
  const pawnId = new mongoose.Types.ObjectId()
  const pawnNo = 'PW-20260917-SCAN01'

  const mockItem = {
    _id: itemId,
    sku: 'PWN-20260917-SCAN01',
    barcode: pawnNo,
    name: 'iPhone 14 Pro',
    brand: 'Apple',
    model: 'iPhone 14 Pro 128GB',
    imei1: '358901234567890',
    sellPrice: 0,
    status: 'PAWNED',
  }

  const mockPawn = {
    _id: pawnId,
    pawnNo,
    status: 'ACTIVE',
    customer: { name: 'Sokha Meng' },
    inventoryItem: mockItem,
  }

  // Scanner finds via InventoryItem.findOne (barcode: exactCode)
  InventoryItem.findOne = (query) => {
    if (query.$or && query.$or.some((c) => c.barcode && c.barcode.test && c.barcode.test(pawnNo))) {
      return Promise.resolve(mockItem)
    }
    return Promise.resolve(null)
  }
  Pawn.findOne = () => ({
    select: () => ({
      populate: () => ({
        lean: () => Promise.resolve(mockPawn),
      }),
    }),
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'GET',
      url: `/inventory/scan/${pawnNo}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.ok(res.body.item)
    assert.equal(res.body.item.barcode, pawnNo)
    assert.ok(res.body.relatedPawn)
    assert.equal(res.body.relatedPawn.pawnNo, pawnNo)
    assert.equal(res.body.relatedPawn.customer.name, 'Sokha Meng')
  } finally {
    InventoryItem.findOne = origItemFindOne
    Pawn.findOne = origPawnFindOne
  }
})

test('Inventory scan: fallback resolves collateral when code matches pawnNo directly', async () => {
  const origItemFindOne = InventoryItem.findOne
  const origPawnFindOne = Pawn.findOne
  const itemId = new mongoose.Types.ObjectId()
  const pawnId = new mongoose.Types.ObjectId()
  const pawnNo = 'PW-20260917-FALLBACK'

  const mockItem = {
    _id: itemId,
    sku: 'PWN-FALLBACK',
    barcode: pawnNo,
    name: 'iPad Pro 11',
    status: 'PAWNED',
  }

  const mockPawn = {
    _id: pawnId,
    pawnNo,
    status: 'ACTIVE',
    customer: { name: 'Dara Chan' },
    inventoryItem: mockItem,
  }

  // Item not found directly in inventory items table
  InventoryItem.findOne = () => Promise.resolve(null)
  Pawn.findOne = (query) => {
    if (query.pawnNo && query.pawnNo.test && query.pawnNo.test(pawnNo)) {
      return {
        select: () => ({
          populate: () => ({
            populate: () => ({
              lean: () => Promise.resolve(mockPawn),
            }),
          }),
        }),
      }
    }
    return {
      select: () => ({
        populate: () => ({
          populate: () => ({
            lean: () => Promise.resolve(null),
          }),
        }),
      }),
    }
  }

  try {
    const res = await callRouter(apiRouter, {
      method: 'GET',
      url: `/inventory/scan/${pawnNo}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.ok(res.body.item)
    assert.equal(res.body.item.name, 'iPad Pro 11')
    assert.ok(res.body.relatedPawn)
    assert.equal(res.body.relatedPawn.pawnNo, pawnNo)
  } finally {
    InventoryItem.findOne = origItemFindOne
    Pawn.findOne = origPawnFindOne
  }
})

test('Inventory scan: resolves collateral item and related pawn when scanning PWN SKU', async () => {
  const origItemFindOne = InventoryItem.findOne
  const origPawnFindOne = Pawn.findOne
  const itemId = new mongoose.Types.ObjectId()
  const pawnId = new mongoose.Types.ObjectId()
  const pawnSku = 'PWN-20260918-COLLAT1'
  const pawnNo = 'PW-20260918-CONTRACT1'

  const mockItem = {
    _id: itemId,
    sku: pawnSku,
    barcode: pawnSku,
    name: 'iPhone 15 Pro Max',
    brand: 'Apple',
    model: 'iPhone 15 Pro Max',
    imei1: '358901234567899',
    status: 'PAWNED',
  }

  const mockPawn = {
    _id: pawnId,
    pawnNo,
    status: 'ACTIVE',
    customer: { name: 'Vannak Lim' },
    inventoryItem: mockItem,
  }

  InventoryItem.findOne = (query) => {
    if (query.$or && query.$or.some((c) => (c.sku && c.sku.test && c.sku.test(pawnSku)) || (c.barcode && c.barcode.test && c.barcode.test(pawnSku)))) {
      return Promise.resolve(mockItem)
    }
    return Promise.resolve(null)
  }
  Pawn.findOne = () => ({
    select: () => ({
      populate: () => ({
        lean: () => Promise.resolve(mockPawn),
      }),
    }),
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'GET',
      url: `/inventory/scan/${pawnSku}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.ok(res.body.item)
    assert.equal(res.body.item.sku, pawnSku)
    assert.equal(res.body.item.barcode, pawnSku)
    assert.ok(res.body.relatedPawn)
    assert.equal(res.body.relatedPawn.pawnNo, pawnNo)
    assert.equal(res.body.relatedPawn.customer.name, 'Vannak Lim')
  } finally {
    InventoryItem.findOne = origItemFindOne
    Pawn.findOne = origPawnFindOne
  }
})

test('Inventory lookup GET /inventory/:id: resolves collateral item and related pawn when querying by PWN SKU', async () => {
  const origItemFindOne = InventoryItem.findOne
  const origPawnFindOne = Pawn.findOne
  const itemId = new mongoose.Types.ObjectId()
  const pawnId = new mongoose.Types.ObjectId()
  const pawnSku = 'PWN-20260918-COLLAT2'
  const pawnNo = 'PW-20260918-CONTRACT2'

  const mockItem = {
    _id: itemId,
    sku: pawnSku,
    barcode: pawnSku,
    name: 'Samsung S24 Ultra',
    status: 'PAWNED',
    toObject() { return { ...mockItem } },
  }

  const mockPawn = {
    _id: pawnId,
    pawnNo,
    status: 'ACTIVE',
  }

  InventoryItem.findOne = (query) => {
    if (query.$or && query.$or.some((c) => (c.sku && c.sku.test && c.sku.test(pawnSku)) || (c.barcode && c.barcode.test && c.barcode.test(pawnSku)))) {
      return Promise.resolve(mockItem)
    }
    return Promise.resolve(null)
  }
  Pawn.findOne = () => ({
    select: () => ({
      lean: () => Promise.resolve(mockPawn),
    }),
  })

  try {
    const res = await callRouter(apiRouter, {
      method: 'GET',
      url: `/inventory/${pawnSku}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.ok(res.body.item)
    assert.equal(res.body.item.sku, pawnSku)
    assert.ok(res.body.item.relatedPawn)
    assert.equal(res.body.item.relatedPawn.pawnNo, pawnNo)
  } finally {
    InventoryItem.findOne = origItemFindOne
    Pawn.findOne = origPawnFindOne
  }
})

test('Inventory lookup GET /inventory/:id: resolves collateral item and related pawn when querying by legacy pawnNo', async () => {
  const origItemFindOne = InventoryItem.findOne
  const origItemFindById = InventoryItem.findById
  const origPawnFindOne = Pawn.findOne
  const itemId = new mongoose.Types.ObjectId()
  const pawnId = new mongoose.Types.ObjectId()
  const pawnSku = 'PWN-20260918-LEGACY'
  const legacyPawnNo = 'PW-20260918-LEGACY'

  const mockItem = {
    _id: itemId,
    sku: pawnSku,
    barcode: legacyPawnNo,
    name: 'Google Pixel 8 Pro',
    status: 'PAWNED',
    toObject() { return { ...mockItem } },
  }

  const mockPawn = {
    _id: pawnId,
    pawnNo: legacyPawnNo,
    status: 'ACTIVE',
    inventoryItem: itemId,
  }

  InventoryItem.findOne = () => Promise.resolve(null)
  Pawn.findOne = (query) => {
    if (query.pawnNo) {
      return {
        select: () => ({
          lean: () => Promise.resolve(mockPawn),
        }),
      }
    }
    return {
      select: () => ({
        lean: () => Promise.resolve({ pawnNo: legacyPawnNo, status: 'ACTIVE' }),
      }),
    }
  }
  InventoryItem.findById = () => Promise.resolve(mockItem)

  try {
    const res = await callRouter(apiRouter, {
      method: 'GET',
      url: `/inventory/${legacyPawnNo}`,
      user: mockOwner,
    })
    assert.equal(res.status, 200)
    assert.ok(res.body.item)
    assert.equal(res.body.item.sku, pawnSku)
    assert.ok(res.body.item.relatedPawn)
    assert.equal(res.body.item.relatedPawn.pawnNo, legacyPawnNo)
  } finally {
    InventoryItem.findOne = origItemFindOne
    InventoryItem.findById = origItemFindById
    Pawn.findOne = origPawnFindOne
  }
})
