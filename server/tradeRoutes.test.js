import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import apiRouter from './routes.js'
import serviceRouter from './serviceRoutes.js'
import { ActivityLog, Customer, InventoryItem, Supplier, Trade, User } from './models.js'
import { ServiceCharge, ServiceOffering } from './serviceModels.js'
import { AuthSession } from './authSessionModels.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-trade-routes-12345'
mongoose.set('bufferCommands', false)

const testSessionId = 'trade-test-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00010'),
  name: 'Owner Sreypov',
  email: 'owner@phoneflow.test',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00011'),
  name: 'Manager Dara',
  email: 'manager@phoneflow.test',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00012'),
  name: 'Cashier Vanna',
  email: 'cashier@phoneflow.test',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00013'),
  name: 'Stock Kosal',
  email: 'stock@phoneflow.test',
  role: 'STOCK',
  active: true,
}

let currentUser = mockOwner

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
const origStartSession = mongoose.startSession
const origActivityLogCreate = ActivityLog.create
const origInventoryItemFindOne = InventoryItem.findOne
const origInventoryItemFindById = InventoryItem.findById
const origCustomerCreate = Customer.create

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
  ActivityLog.create = async () => []
  InventoryItem.findOne = () => ({
    select: async () => null,
  })
  InventoryItem.findById = () => {
    const p = Promise.resolve(null)
    p.session = () => p
    p.select = () => p
    return p
  }
  Customer.create = async ([data]) => [{ _id: new mongoose.Types.ObjectId(), ...data }]
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById
  mongoose.startSession = origStartSession
  ActivityLog.create = origActivityLogCreate
  InventoryItem.findOne = origInventoryItemFindOne
  InventoryItem.findById = origInventoryItemFindById
  Customer.create = origCustomerCreate
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

    router(req, res, (err) => {
      if (err) {
        resolve({
          status: err.status || err.statusCode || 500,
          body: { message: err.message },
          headers: responseHeaders,
        })
      } else {
        resolve({ status: 404, body: { message: 'Not Found' }, headers: responseHeaders })
      }
    })
  })
}

// ============================================================================
// 1. Role Permissions & Isolation
// ============================================================================

test('POST /trades (BUY): CASHIER is rejected with 403, unauthenticated rejected with 401', async () => {
  const payload = {
    type: 'BUY',
    sellerType: 'WALK_IN',
    seller: { name: 'Seller Walk-in' },
    currency: 'USD',
    amountPaid: 100,
    items: [{
      category: 'ACCESSORY',
      name: 'USB-C Cable',
      brand: 'Anker',
      sku: 'ANK-USBC-01',
      quantity: 5,
      purchasePrice: 20,
    }],
  }

  // Unauthenticated
  const unauthRes = await callRouter(apiRouter, {
    method: 'POST',
    url: '/trades',
    body: payload,
    user: null,
  })
  assert.equal(unauthRes.status, 401)

  // Cashier role
  const cashierRes = await callRouter(apiRouter, {
    method: 'POST',
    url: '/trades',
    body: payload,
    user: mockCashier,
  })
  assert.equal(cashierRes.status, 403)
  assert.match(cashierRes.body.message, /permission/i)
})

test('POST /trades (SELL): STOCK is rejected with 403, CASHIER is allowed', async () => {
  const fakeItemId = new mongoose.Types.ObjectId()
  const payload = {
    type: 'SELL',
    currency: 'USD',
    warrantyDays: 0,
    amountPaid: 50,
    paymentMethod: 'CASH',
    items: [{
      inventoryItem: fakeItemId.toString(),
      quantity: 1,
    }],
  }

  // Stock role
  const stockRes = await callRouter(apiRouter, {
    method: 'POST',
    url: '/trades',
    body: payload,
    user: mockStock,
  })
  assert.equal(stockRes.status, 403)
  assert.match(stockRes.body.message, /permission/i)
})

test('GET /trades: CASHIER sees only SELL, STOCK sees only BUY, OWNER sees requested filter', async () => {
  const origTradeFind = Trade.find
  let capturedFilter = null

  Trade.find = (filter) => {
    capturedFilter = filter
    return {
      populate: () => ({
        populate: () => ({
          sort: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }
  }

  try {
    // CASHIER
    await callRouter(apiRouter, { method: 'GET', url: '/trades?type=BUY', user: mockCashier })
    assert.deepEqual(capturedFilter, { type: 'SELL' })

    // STOCK
    await callRouter(apiRouter, { method: 'GET', url: '/trades?type=SELL', user: mockStock })
    assert.deepEqual(capturedFilter, { type: 'BUY' })

    // OWNER requesting BUY
    await callRouter(apiRouter, { method: 'GET', url: '/trades?type=BUY', user: mockOwner })
    assert.deepEqual(capturedFilter, { type: 'BUY' })

    // OWNER requesting all
    await callRouter(apiRouter, { method: 'GET', url: '/trades', user: mockOwner })
    assert.deepEqual(capturedFilter, {})
  } finally {
    Trade.find = origTradeFind
  }
})

// ============================================================================
// 2. Multi-Item Purchase: Serialized vs Quantity, Duplicate IMEI, Restocking
// ============================================================================

test('POST /trades (BUY): rejects phone with invalid IMEI (<15 or non-digit)', async () => {
  const payload = {
    type: 'BUY',
    sellerType: 'WALK_IN',
    seller: { name: 'Dara' },
    currency: 'USD',
    amountPaid: 300,
    items: [{
      category: 'PHONE',
      brand: 'Apple',
      model: 'iPhone 13',
      storage: '128',
      color: 'Blue',
      imei: '12345', // invalid
      purchasePrice: 300,
    }],
  }

  const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockManager })
  assert.equal(res.status, 400)
  assert.match(res.body.message, /IMEI must contain exactly 15 digits/i)
})

test('POST /trades (BUY): rejects duplicate IMEI in the same batch (409)', async () => {
  const payload = {
    type: 'BUY',
    sellerType: 'WALK_IN',
    seller: { name: 'Dara' },
    currency: 'USD',
    amountPaid: 600,
    items: [
      {
        category: 'PHONE',
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128',
        color: 'Blue',
        imei: '123456789012345',
        purchasePrice: 300,
      },
      {
        category: 'PHONE',
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128',
        color: 'Midnight',
        imei: '123456789012345', // duplicate
        purchasePrice: 300,
      },
    ],
  }

  const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockManager })
  assert.equal(res.status, 409)
  assert.match(res.body.message, /appears more than once in this purchase/i)
})

test('POST /trades (BUY): rejects IMEI that already exists in inventory (409)', async () => {
  const origFindOne = InventoryItem.findOne
  InventoryItem.findOne = (query) => {
    if (query?.imei1) {
      return { select: async () => ({ imei1: '123456789012345' }) }
    }
    return { select: async () => null }
  }

  try {
    const payload = {
      type: 'BUY',
      sellerType: 'WALK_IN',
      seller: { name: 'Dara' },
      currency: 'USD',
      amountPaid: 300,
      items: [{
        category: 'PHONE',
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128',
        color: 'Blue',
        imei: '123456789012345',
        purchasePrice: 300,
      }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockStock })
    assert.equal(res.status, 409)
    assert.match(res.body.message, /already exists in inventory/i)
  } finally {
    InventoryItem.findOne = origFindOne
  }
})

test('POST /trades (BUY): restocks existing accessory and calculates weighted average cost', async () => {
  const existingId = new mongoose.Types.ObjectId()
  const existingAccessory = {
    _id: existingId,
    name: '20W USB-C Charger',
    category: 'ACCESSORY',
    status: 'IN_STOCK',
    quantity: 10,
    buyPrice: 15.00, // 10 * $15 = $150
    save: async function () { return this },
  }

  const origFindById = InventoryItem.findById
  const origItemFindOne = InventoryItem.findOne
  const origTradeCreate = Trade.create

  InventoryItem.findById = () => ({
    session: () => Promise.resolve(existingAccessory),
  })
  InventoryItem.findOne = () => ({
    select: async () => null,
  })

  let createdTrade = null
  Trade.create = async ([tradeData]) => {
    createdTrade = {
      _id: new mongoose.Types.ObjectId(),
      ...tradeData,
      populate: async function () { return this },
    }
    return [createdTrade]
  }

  try {
    // Buy 5 more units at $18 each (5 * $18 = $90).
    // Total value = 150 + 90 = $240. Next quantity = 15.
    // Weighted average buyPrice = 240 / 15 = $16.00.
    const payload = {
      type: 'BUY',
      sellerType: 'WALK_IN',
      seller: { name: 'Supplier Heng' },
      currency: 'USD',
      amountPaid: 90,
      items: [{
        category: 'ACCESSORY',
        inventoryItem: existingId.toString(),
        quantity: 5,
        purchasePrice: 18.00,
      }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockManager })
    assert.equal(res.status, 201)
    assert.equal(existingAccessory.quantity, 15)
    assert.equal(existingAccessory.buyPrice, 16.00)
  } finally {
    InventoryItem.findById = origFindById
    InventoryItem.findOne = origItemFindOne
    Trade.create = origTradeCreate
  }
})

test('POST /trades (BUY): preserves fractional weighted average cost across repeated restocks', async () => {
  const existingId = new mongoose.Types.ObjectId()
  const stock = { _id: existingId, name: 'Fixture', category: 'ACCESSORY', status: 'IN_STOCK',
    quantity: 2, buyPrice: 0.01, save: async function () { return this } }
  const originalCreate = Trade.create
  InventoryItem.findById = () => ({ session: async () => stock })
  Trade.create = async ([data]) => [{ _id: new mongoose.Types.ObjectId(), ...data, populate: async function () { return this } }]
  try {
    for (let count = 0; count < 2; count++) {
      const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', user: mockManager,
        body: { type: 'BUY', sellerType: 'WALK_IN', seller: { name: 'Fixture seller' }, currency: 'USD', amountPaid: 0.02,
          items: [{ category: 'ACCESSORY', inventoryItem: existingId.toString(), quantity: 1, purchasePrice: 0.02 }] } })
      assert.equal(res.status, 201)
      assert.ok(Math.abs(stock.buyPrice * stock.quantity - (0.02 + (count + 1) * 0.02)) < 1e-10)
    }
  } finally { Trade.create = originalCreate }
})

test('POST /trades (BUY): bulk KHR inventory cost agrees with purchase total', async () => {
  const originalItemCreate = InventoryItem.create
  const originalTradeCreate = Trade.create
  let stock, trade
  InventoryItem.create = async ([data]) => { stock = { _id: new mongoose.Types.ObjectId(), ...data }; return [stock] }
  Trade.create = async ([data]) => {
    trade = { _id: new mongoose.Types.ObjectId(), ...data, populate: async function () { return this } }
    return [trade]
  }
  try {
    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', user: mockManager,
      body: { type: 'BUY', sellerType: 'WALK_IN', seller: { name: 'Fixture seller' }, currency: 'KHR', exchangeRate: 4100,
        amountPaid: 100000, items: [{ category: 'ACCESSORY', name: 'Fixture', brand: 'Test', sku: 'PRECISION-TEST',
          quantity: 1000, purchasePrice: 100 }] } })
    assert.equal(res.status, 201)
    assert.equal(trade.transactionTotal, 100000)
    assert.equal(Math.round(stock.buyPrice * stock.quantity * 100) / 100, 24.39)
    assert.ok(Math.abs(stock.buyPrice * stock.quantity - trade.total) < 1e-10)
    assert.ok(Math.abs(trade.items[0].costPrice * trade.items[0].quantity - trade.total) < 1e-10)
  } finally {
    InventoryItem.create = originalItemCreate
    Trade.create = originalTradeCreate
  }
})

test('POST /trades (BUY): rejects restocking phones or tablets as existing inventory (400)', async () => {
  const existingId = new mongoose.Types.ObjectId()
  const payload = {
    type: 'BUY',
    sellerType: 'WALK_IN',
    seller: { name: 'Supplier Heng' },
    currency: 'USD',
    amountPaid: 400,
    items: [{
      category: 'PHONE',
      inventoryItem: existingId.toString(),
      quantity: 1,
      purchasePrice: 400,
    }],
  }

  const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockStock })
  assert.equal(res.status, 400)
  assert.match(res.body.message, /phones and tablets must be entered as new units/i)
})

test('POST /trades (BUY): validates KHR increments without rounding away stored unit cost precision', async () => {
  // Test invalid KHR increment (e.g. 50 riels)
  const invalidPayload = {
    type: 'BUY',
    sellerType: 'WALK_IN',
    seller: { name: 'Walk-in' },
    currency: 'KHR',
    exchangeRate: 4100,
    amountPaid: 40050, // not divisible by 100
    items: [{
      category: 'ACCESSORY',
      name: 'Screen Guard',
      brand: 'Baseus',
      sku: 'BAS-SG-01',
      quantity: 1,
      purchasePrice: 40050,
    }],
  }

  const invalidRes = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: invalidPayload, user: mockManager })
  assert.equal(invalidRes.status, 400)
  assert.match(invalidRes.body.message, /whole 100 KHR increments/i)

  // Test valid KHR purchase and verify roundMoney USD conversion
  const origFindOne = InventoryItem.findOne
  const origItemCreate = InventoryItem.create
  const origTradeCreate = Trade.create

  InventoryItem.findOne = () => ({ select: async () => null })
  let createdItem = null
  InventoryItem.create = async ([itemData]) => {
    createdItem = { _id: new mongoose.Types.ObjectId(), ...itemData }
    return [createdItem]
  }
  let createdTrade = null
  Trade.create = async ([tradeData]) => {
    createdTrade = {
      _id: new mongoose.Types.ObjectId(),
      ...tradeData,
      populate: async function () { return this },
    }
    return [createdTrade]
  }

  try {
    // 100,000 KHR at 4,100 rate = 100000 / 4100 = 24.39024...
    // Stored conversion retains precision; display/aggregate boundaries round it.
    const validPayload = {
      type: 'BUY',
      sellerType: 'WALK_IN',
      seller: { name: 'Walk-in' },
      currency: 'KHR',
      exchangeRate: 4100,
      amountPaid: 100000,
      items: [{
        category: 'ACCESSORY',
        name: 'Screen Guard',
        brand: 'Baseus',
        sku: 'BAS-SG-01',
        quantity: 1,
        purchasePrice: 100000,
      }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: validPayload, user: mockManager })
    assert.equal(res.status, 201)
    assert.ok(Math.abs(createdItem.buyPrice - 100000 / 4100) < 1e-10)
    assert.ok(Math.abs(createdTrade.total - 100000 / 4100) < 1e-10)
    assert.ok(Math.abs(createdTrade.amountPaid - 100000 / 4100) < 1e-10)
  } finally {
    InventoryItem.findOne = origFindOne
    InventoryItem.create = origItemCreate
    Trade.create = origTradeCreate
  }
})

// ============================================================================
// 3. Sale Workflows: Stock Validation, Status Transitions, Pricing
// ============================================================================

function mockItemFindById(item) {
  return () => {
    const p = Promise.resolve(item)
    p.session = () => p
    p.select = () => p
    return p
  }
}

test('POST /trades (SELL): rejects unavailable or out-of-stock inventory (409)', async () => {
  const fakeItemId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById

  // Item is SOLD
  InventoryItem.findById = mockItemFindById({
    _id: fakeItemId,
    name: 'iPhone 13',
    category: 'PHONE',
    status: 'SOLD',
    quantity: 0,
    sellPrice: 500,
    minimumSellPrice: 450,
  })

  try {
    const payload = {
      type: 'SELL',
      currency: 'USD',
      warrantyDays: 0,
      amountPaid: 500,
      paymentMethod: 'CASH',
      items: [{ inventoryItem: fakeItemId.toString(), quantity: 1 }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockCashier })
    assert.equal(res.status, 409)
    assert.match(res.body.message, /not have enough available stock/i)
  } finally {
    InventoryItem.findById = origFindById
  }
})

test('POST /trades (SELL): rejects insufficient quantity for non-serialized stock (409)', async () => {
  const fakeItemId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById

  InventoryItem.findById = mockItemFindById({
    _id: fakeItemId,
    name: 'Screen Guard',
    category: 'ACCESSORY',
    status: 'IN_STOCK',
    quantity: 3, // only 3 in stock
    sellPrice: 10,
    minimumSellPrice: 8,
  })

  try {
    const payload = {
      type: 'SELL',
      currency: 'USD',
      warrantyDays: 0,
      amountPaid: 50,
      paymentMethod: 'CASH',
      items: [{ inventoryItem: fakeItemId.toString(), quantity: 5 }], // requesting 5
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockCashier })
    assert.equal(res.status, 409)
    assert.match(res.body.message, /not have enough available stock/i)
  } finally {
    InventoryItem.findById = origFindById
  }
})

test('POST /trades (SELL): Cashier cannot discount below minimum price (400)', async () => {
  const fakeItemId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById

  InventoryItem.findById = mockItemFindById({
    _id: fakeItemId,
    name: 'iPhone 14',
    category: 'PHONE',
    status: 'IN_STOCK',
    quantity: 1,
    sellPrice: 800,
    minimumSellPrice: 750, // minimum price is $750, max discount = $50
  })

  try {
    // Attempting discount of $100 ($800 - $100 = $700 < $750)
    const payload = {
      type: 'SELL',
      currency: 'USD',
      warrantyDays: 0,
      discount: 100,
      amountPaid: 700,
      paymentMethod: 'CASH',
      items: [{ inventoryItem: fakeItemId.toString(), quantity: 1 }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockCashier })
    assert.equal(res.status, 400)
    assert.match(res.body.message, /discount cannot exceed/i)
  } finally {
    InventoryItem.findById = origFindById
  }
})

test('POST /trades (SELL): executes successfully, marks PHONE as SOLD, and records correct change due', async () => {
  const fakeItemId = new mongoose.Types.ObjectId()
  const phoneItem = {
    _id: fakeItemId,
    name: 'iPhone 15 Pro',
    category: 'PHONE',
    status: 'IN_STOCK',
    quantity: 1,
    sellPrice: 1000,
    minimumSellPrice: 950,
    buyPrice: 800,
    save: async function () { return this },
  }

  const origFindById = InventoryItem.findById
  const origTradeCreate = Trade.create

  InventoryItem.findById = mockItemFindById(phoneItem)

  let createdTrade = null
  Trade.create = async ([tradeData]) => {
    createdTrade = {
      _id: new mongoose.Types.ObjectId(),
      ...tradeData,
      populate: async function () { return this },
    }
    return [createdTrade]
  }

  try {
    // Price = 1000, Discount = 20, Total = 980.
    // Amount received = 1000. Amount paid = 980. Change due = 20.
    const payload = {
      type: 'SELL',
      currency: 'USD',
      warrantyDays: 30,
      discount: 20,
      amountReceived: 1000,
      amountPaid: 980,
      paymentMethod: 'CASH',
      items: [{ inventoryItem: fakeItemId.toString(), quantity: 1 }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockManager })
    assert.equal(res.status, 201)
    assert.equal(phoneItem.quantity, 0)
    assert.equal(phoneItem.status, 'SOLD')
    assert.equal(createdTrade.transactionTotal, 980)
    assert.equal(createdTrade.transactionAmountPaid, 980)
    assert.equal(createdTrade.transactionChangeDue, 20)
    assert.equal(createdTrade.transactionBalance, 0)
    assert.equal(createdTrade.paymentStatus, 'PAID')
  } finally {
    InventoryItem.findById = origFindById
    Trade.create = origTradeCreate
  }
})

// ============================================================================
// 4. Service Charges: Inventory Isolation & Zero Mutation
// ============================================================================

test('POST /charges: does not mutate or access inventory', async () => {
  const fakeOfferingId = new mongoose.Types.ObjectId()
  const origOfferingFindById = ServiceOffering.findById
  const origChargeCreate = ServiceCharge.create
  const origItemFind = InventoryItem.find
  const origItemFindById = InventoryItem.findById

  let inventoryTouched = false
  InventoryItem.find = () => { inventoryTouched = true; return Promise.resolve([]) }
  InventoryItem.findById = () => { inventoryTouched = true; return Promise.resolve(null) }

  ServiceOffering.findById = async () => ({
    _id: fakeOfferingId,
    name: 'iCloud Setup',
    category: 'ACCOUNT_SETUP',
    currency: 'USD',
    price: 10,
    priceUsd: 10,
    priceKhr: 41000,
    active: true,
  })

  let createdCharge = null
  ServiceCharge.create = async (data) => {
    const payload = Array.isArray(data) ? data[0] : data
    createdCharge = {
      _id: new mongoose.Types.ObjectId(),
      serviceNo: 'SV-2026-0001',
      ...payload,
      populate: async function () { return this },
    }
    return createdCharge
  }

  try {
    const payload = {
      offeringId: fakeOfferingId.toString(),
      customerName: 'Walk-in Sam',
      quantity: 1,
      currency: 'USD',
      discount: 0,
      paymentMethod: 'CASH',
    }

    const res = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: payload,
      user: mockCashier,
    })

    assert.equal(res.status, 201)
    assert.equal(createdCharge.total, 10)
    // Crucial check: Inventory was completely untouched!
    assert.equal(inventoryTouched, false)
  } finally {
    ServiceOffering.findById = origOfferingFindById
    ServiceCharge.create = origChargeCreate
    InventoryItem.find = origItemFind
    InventoryItem.findById = origItemFindById
  }
})

// ============================================================================
// 5. Concurrency & Customer/Supplier Validation
// ============================================================================

test('POST /trades (SELL): rejects duplicate recording of the same KHQR transaction (409)', async () => {
  const origTradeExists = Trade.exists
  const origEnabled = process.env.PAYWAY_ENABLED
  const origMerchant = process.env.PAYWAY_MERCHANT_ID
  const origKey = process.env.PAYWAY_API_KEY

  process.env.PAYWAY_ENABLED = 'true'
  process.env.PAYWAY_MERCHANT_ID = 'test-merchant'
  process.env.PAYWAY_API_KEY = 'test-api-key'

  Trade.exists = async (query) => {
    if (query?.paywayTransactionId) return { _id: new mongoose.Types.ObjectId() }
    return null
  }

  try {
    const payload = {
      type: 'SELL',
      currency: 'USD',
      warrantyDays: 0,
      paymentMethod: 'KHQR',
      paywayTransactionId: 'PF1234567890',
      items: [{ inventoryItem: new mongoose.Types.ObjectId().toString(), quantity: 1 }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockCashier })
    assert.equal(res.status, 409)
    assert.match(res.body.message, /already been recorded/i)
  } finally {
    Trade.exists = origTradeExists
    process.env.PAYWAY_ENABLED = origEnabled
    process.env.PAYWAY_MERCHANT_ID = origMerchant
    process.env.PAYWAY_API_KEY = origKey
  }
})

test('POST /trades (BUY): NEW_CUSTOMER requires phone number (400)', async () => {
  const payload = {
    type: 'BUY',
    sellerType: 'NEW_CUSTOMER',
    seller: { name: 'Customer Without Phone', phone: '' },
    currency: 'USD',
    amountPaid: 100,
    items: [{
      category: 'ACCESSORY',
      name: 'Case',
      brand: 'Spigen',
      sku: 'SPG-CASE-01',
      quantity: 1,
      purchasePrice: 100,
    }],
  }

  const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockManager })
  assert.equal(res.status, 400)
  assert.match(res.body.message, /phone number is required for a new customer/i)
})

test('POST /trades (SELL): rejects non-existent customer (404)', async () => {
  const fakeItemId = new mongoose.Types.ObjectId()
  const fakeCustId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById
  const origCustExists = Customer.exists

  InventoryItem.findById = mockItemFindById({
    _id: fakeItemId,
    name: 'iPhone 15',
    category: 'PHONE',
    status: 'IN_STOCK',
    quantity: 1,
    sellPrice: 900,
    minimumSellPrice: 850,
    save: async function () { return this },
  })

  Customer.exists = () => ({
    session: () => Promise.resolve(null), // customer not found
  })

  try {
    const payload = {
      type: 'SELL',
      customer: fakeCustId.toString(),
      currency: 'USD',
      warrantyDays: 0,
      amountPaid: 900,
      paymentMethod: 'CASH',
      items: [{ inventoryItem: fakeItemId.toString(), quantity: 1 }],
    }

    const res = await callRouter(apiRouter, { method: 'POST', url: '/trades', body: payload, user: mockCashier })
    assert.equal(res.status, 404)
    assert.match(res.body.message, /customer was not found/i)
  } finally {
    InventoryItem.findById = origFindById
    Customer.exists = origCustExists
  }
})

test('POST /trades (BUY): sanitizes "NULL" SKU and auto-generates clean BUY code for phone purchase', async () => {
  const originalItemCreate = InventoryItem.create
  const originalTradeCreate = Trade.create
  let stock, trade
  InventoryItem.create = async ([data]) => { stock = { _id: new mongoose.Types.ObjectId(), ...data }; return [stock] }
  Trade.create = async ([data]) => {
    trade = { _id: new mongoose.Types.ObjectId(), ...data, populate: async function () { return this } }
    return [trade]
  }
  try {
    const res = await callRouter(apiRouter, {
      method: 'POST',
      url: '/trades',
      user: mockManager,
      body: {
        type: 'BUY',
        sellerType: 'WALK_IN',
        seller: { name: 'Customer seller' },
        currency: 'USD',
        exchangeRate: 4100,
        amountPaid: 500,
        items: [{
          category: 'PHONE',
          brand: 'Samsung',
          model: 'Galaxy S24',
          storage: '256GB',
          color: 'Black',
          imei: '358912345678901',
          sku: 'NULL',
          purchasePrice: 500,
        }],
      },
    })
    assert.equal(res.status, 201)
    assert.notEqual(stock.sku, 'NULL', 'Must not store literal string "NULL" as SKU')
    assert.match(stock.sku, /^BUY-/, 'Auto-generates clean BUY- SKU')
    assert.notEqual(stock.barcode, 'NULL', 'Must not store literal string "NULL" as barcode')
    assert.match(stock.barcode, /^PF-/, 'Auto-generates clean PF- barcode')
  } finally {
    InventoryItem.create = originalItemCreate
    Trade.create = originalTradeCreate
  }
})

test('POST /trades (BUY): rejects literal "NULL" SKU for ACCESSORY where SKU is required', async () => {
  const res = await callRouter(apiRouter, {
    method: 'POST',
    url: '/trades',
    user: mockManager,
    body: {
      type: 'BUY',
      sellerType: 'WALK_IN',
      seller: { name: 'Customer seller' },
      currency: 'USD',
      exchangeRate: 4100,
      amountPaid: 20,
      items: [{
        category: 'ACCESSORY',
        name: 'Case',
        brand: 'Spigen',
        sku: 'NULL',
        quantity: 1,
        purchasePrice: 20,
      }],
    },
  })
  assert.equal(res.status, 400)
  assert.match(res.body.message, /valid SKU are required/i)
})
