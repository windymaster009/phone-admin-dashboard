import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { ActivityLog, Customer, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { ServiceCharge, ServiceOffering } from './serviceModels.js'
import serviceRouter from './serviceRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-service-lifecycle'
mongoose.set('bufferCommands', false)

const testSessionId = 'service-lifecycle-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00040'),
  name: 'Owner Sreypov',
  email: 'owner@phoneflow.test',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00041'),
  name: 'Manager Dara',
  email: 'manager@phoneflow.test',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00042'),
  name: 'Cashier Vanna',
  email: 'cashier@phoneflow.test',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00043'),
  name: 'Stock Kosal',
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
      header(name) {
        return this.headers[String(name).toLowerCase()]
      },
      get(name) {
        return this.header(name)
      },
      cookies: {},
      query: parsedQuery,
      params: {},
      body,
      user: null,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    }

    const res = {
      statusCode: 200,
      headers: {},
      _headers: {},
      _body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      setHeader(name, value) {
        this.headers[name] = value
        this._headers[String(name).toLowerCase()] = value
        return this
      },
      getHeader(name) {
        return this._headers[String(name).toLowerCase()]
      },
      json(data) {
        this._body = data
        resolve({ status: this.statusCode, headers: this.headers, body: data })
        return this
      },
      send(data) {
        this._body = data
        resolve({ status: this.statusCode, headers: this.headers, body: data })
        return this
      },
      end(data) {
        if (data !== undefined) this._body = data
        resolve({ status: this.statusCode, headers: this.headers, body: this._body })
        return this
      },
    }

    const next = (err) => {
      if (err) {
        const status = err.status || err.statusCode || 500
        resolve({
          status,
          headers: res.headers,
          body: { message: err.message || 'Internal server error', status },
        })
      } else {
        resolve({
          status: 404,
          headers: res.headers,
          body: { message: 'Route not found' },
        })
      }
    }

    try {
      router(req, res, next)
    } catch (err) {
      next(err)
    }
  })
}

// ============================================================================
// 1. Role-Based Authorization
// ============================================================================

test('Service server roles: STOCK is rejected on GET /catalog with 403', async () => {
  const origUpdateOne = ServiceOffering.updateOne
  const origFind = ServiceOffering.find
  ServiceOffering.updateOne = async () => ({ acknowledged: true })
  ServiceOffering.find = () => ({
    sort: () => ({
      lean: async () => [],
    }),
  })

  try {
    const res = await callRouter(serviceRouter, {
      method: 'GET',
      url: '/catalog',
      user: mockStock,
    })
    assert.equal(res.status, 403)
  } finally {
    ServiceOffering.updateOne = origUpdateOne
    ServiceOffering.find = origFind
  }
})

test('Service server roles: CASHIER and STOCK cannot patch catalog prices (403)', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const cashierRes = await callRouter(serviceRouter, {
    method: 'PATCH',
    url: `/catalog/${fakeId}`,
    body: { price: 10 },
    user: mockCashier,
  })
  assert.equal(cashierRes.status, 403)

  const stockRes = await callRouter(serviceRouter, {
    method: 'PATCH',
    url: `/catalog/${fakeId}`,
    body: { price: 10 },
    user: mockStock,
  })
  assert.equal(stockRes.status, 403)
})

test('Service server roles: STOCK is rejected on GET and POST /charges (403)', async () => {
  const getRes = await callRouter(serviceRouter, {
    method: 'GET',
    url: '/charges',
    user: mockStock,
  })
  assert.equal(getRes.status, 403)

  const postRes = await callRouter(serviceRouter, {
    method: 'POST',
    url: '/charges',
    body: {},
    user: mockStock,
  })
  assert.equal(postRes.status, 403)
})

test('Service server roles: CASHIER can view catalog and charges', async () => {
  const origUpdateOne = ServiceOffering.updateOne
  const origFind = ServiceOffering.find
  const origChargeFind = ServiceCharge.find

  ServiceOffering.updateOne = async () => ({ acknowledged: true })
  ServiceOffering.find = () => ({
    sort: () => ({ lean: async () => [{ _id: 'svc-1', name: 'Setup', active: true }] }),
  })
  ServiceCharge.find = () => ({
    populate: function () { return this },
    sort: function () { return this },
    limit: function () { return this },
    lean: async () => [{ _id: 'sc-1', serviceNo: 'SV-001' }],
  })

  try {
    const catalogRes = await callRouter(serviceRouter, {
      method: 'GET',
      url: '/catalog',
      user: mockCashier,
    })
    assert.equal(catalogRes.status, 200)
    assert.equal(catalogRes.body.services.length, 1)

    const chargesRes = await callRouter(serviceRouter, {
      method: 'GET',
      url: '/charges',
      user: mockCashier,
    })
    assert.equal(chargesRes.status, 200)
    assert.equal(chargesRes.body.charges.length, 1)
  } finally {
    ServiceOffering.updateOne = origUpdateOne
    ServiceOffering.find = origFind
    ServiceCharge.find = origChargeFind
  }
})

// ============================================================================
// 2. Catalog Management & Price Configuration
// ============================================================================

test('Catalog pricing: rejects invalid service ID (400) and missing service (404)', async () => {
  const invalidIdRes = await callRouter(serviceRouter, {
    method: 'PATCH',
    url: '/catalog/not-an-objectid',
    body: { price: 10 },
    user: mockManager,
  })
  assert.equal(invalidIdRes.status, 400)
  assert.match(invalidIdRes.body.message, /Service ID is invalid/i)

  const origFindById = ServiceOffering.findById
  ServiceOffering.findById = async () => null

  try {
    const notFoundRes = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${new mongoose.Types.ObjectId()}`,
      body: { price: 10 },
      user: mockManager,
    })
    assert.equal(notFoundRes.status, 404)
    assert.match(notFoundRes.body.message, /Service was not found/i)
  } finally {
    ServiceOffering.findById = origFindById
  }
})

test('Catalog pricing: rejects invalid currency, negative prices, and non-100 KHR increments', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById
  ServiceOffering.findById = async () => ({
    _id: fakeId,
    name: 'App Install',
    currency: 'USD',
    price: 0,
  })

  try {
    // Invalid currency
    const badCurrencyRes = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${fakeId}`,
      body: { currency: 'EUR', price: 10 },
      user: mockManager,
    })
    assert.equal(badCurrencyRes.status, 400)
    assert.match(badCurrencyRes.body.message, /Currency must be USD or KHR/i)

    // Negative price
    const negPriceRes = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${fakeId}`,
      body: { currency: 'USD', price: -5 },
      user: mockManager,
    })
    assert.equal(negPriceRes.status, 400)
    assert.match(negPriceRes.body.message, /must be zero or greater/i)

    // Non-100 KHR increment
    const badKhrRes = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${fakeId}`,
      body: { currency: 'KHR', price: 41250 },
      user: mockManager,
    })
    assert.equal(badKhrRes.status, 400)
    assert.match(badKhrRes.body.message, /whole 100 KHR increments/i)
  } finally {
    ServiceOffering.findById = origFindById
  }
})

test('Catalog pricing: successfully updates single currency price and active toggle', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById
  const origFindByIdAndUpdate = ServiceOffering.findByIdAndUpdate

  let capturedUpdate = null
  ServiceOffering.findById = async () => ({
    _id: fakeId,
    code: 'APP_INSTALL',
    name: 'App Installation',
    currency: 'USD',
    price: 0,
    active: true,
  })
  ServiceOffering.findByIdAndUpdate = async (id, update) => {
    capturedUpdate = update.$set
    return {
      _id: fakeId,
      code: 'APP_INSTALL',
      name: 'App Installation',
      ...capturedUpdate,
    }
  }

  try {
    const res = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${fakeId}`,
      body: { currency: 'USD', price: 5.5, active: false },
      user: mockManager,
    })
    assert.equal(res.status, 200)
    assert.equal(capturedUpdate.price, 5.5)
    assert.equal(capturedUpdate.currency, 'USD')
    assert.equal(capturedUpdate.active, false)
  } finally {
    ServiceOffering.findById = origFindById
    ServiceOffering.findByIdAndUpdate = origFindByIdAndUpdate
  }
})

test('Catalog pricing: dual-currency mode requires positive prices and saves exchange rate', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById
  const origFindByIdAndUpdate = ServiceOffering.findByIdAndUpdate

  ServiceOffering.findById = async () => ({
    _id: fakeId,
    code: 'DATA_TRANSFER',
    name: 'Data Transfer',
    currency: 'USD',
    price: 0,
    active: true,
  })

  try {
    // Both currencies must be > 0
    const zeroPriceRes = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${fakeId}`,
      body: { priceUsd: 0, priceKhr: 0 },
      user: mockOwner,
    })
    assert.equal(zeroPriceRes.status, 400)
    assert.match(zeroPriceRes.body.message, /greater than zero in both currencies/i)

    let capturedUpdate = null
    ServiceOffering.findByIdAndUpdate = async (id, update) => {
      capturedUpdate = update.$set
      return {
        _id: fakeId,
        name: 'Data Transfer',
        ...capturedUpdate,
      }
    }

    // Valid dual-currency update
    const validRes = await callRouter(serviceRouter, {
      method: 'PATCH',
      url: `/catalog/${fakeId}`,
      body: { priceUsd: 10, priceKhr: 41000, pricingExchangeRate: 4100, currency: 'KHR' },
      user: mockOwner,
    })
    assert.equal(validRes.status, 200)
    assert.equal(capturedUpdate.priceUsd, 10)
    assert.equal(capturedUpdate.priceKhr, 41000)
    assert.equal(capturedUpdate.pricingExchangeRate, 4100)
    assert.equal(capturedUpdate.currency, 'KHR')
    assert.equal(capturedUpdate.price, 41000) // Default currency matches KHR price
  } finally {
    ServiceOffering.findById = origFindById
    ServiceOffering.findByIdAndUpdate = origFindByIdAndUpdate
  }
})

// ============================================================================
// 3. Service Charge Creation Rules (POST /charges)
// ============================================================================

test('Service charge creation: rejects invalid offering ID or non-existent offering', async () => {
  const invalidIdRes = await callRouter(serviceRouter, {
    method: 'POST',
    url: '/charges',
    body: { offeringId: 'bad-id' },
    user: mockCashier,
  })
  assert.equal(invalidIdRes.status, 400)
  assert.match(invalidIdRes.body.message, /Choose a valid service/i)

  const origFindById = ServiceOffering.findById
  ServiceOffering.findById = async () => null

  try {
    const missingRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: new mongoose.Types.ObjectId() },
      user: mockCashier,
    })
    assert.equal(missingRes.status, 404)
    assert.match(missingRes.body.message, /no longer available/i)
  } finally {
    ServiceOffering.findById = origFindById
  }
})

test('Service charge creation: rejects unpriced or inactive offerings (409/404)', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById

  try {
    // Inactive offering -> 404
    ServiceOffering.findById = async () => ({
      _id: fakeId,
      name: 'Old Service',
      price: 10,
      active: false,
    })
    const inactiveRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId },
      user: mockCashier,
    })
    assert.equal(inactiveRes.status, 404)
    assert.match(inactiveRes.body.message, /no longer available/i)

    // Unpriced offering -> 409
    ServiceOffering.findById = async () => ({
      _id: fakeId,
      name: 'Unpriced Service',
      price: 0,
      active: true,
    })
    const unpricedRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId },
      user: mockCashier,
    })
    assert.equal(unpricedRes.status, 409)
    assert.match(unpricedRes.body.message, /Set a price for this service/i)
  } finally {
    ServiceOffering.findById = origFindById
  }
})

test('Service charge creation: validates currency, customer, quantity, and payment method', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById
  const origCustomerFindById = Customer.findById

  ServiceOffering.findById = async () => ({
    _id: fakeId,
    name: 'Gmail Setup',
    currency: 'USD',
    price: 5,
    priceUsd: 5,
    priceKhr: 20500,
    active: true,
  })

  try {
    // Invalid currency
    const badCurrencyRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, currency: 'THB' },
      user: mockCashier,
    })
    assert.equal(badCurrencyRes.status, 400)
    assert.match(badCurrencyRes.body.message, /currency must be USD or KHR/i)

    // Invalid customer ObjectId
    const badCustIdRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, customerId: 'not-valid' },
      user: mockCashier,
    })
    assert.equal(badCustIdRes.status, 400)
    assert.match(badCustIdRes.body.message, /Choose a valid customer/i)

    // Missing customer in DB
    Customer.findById = () => ({
      select: async () => null,
    })
    const missingCustRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, customerId: new mongoose.Types.ObjectId() },
      user: mockCashier,
    })
    assert.equal(missingCustRes.status, 404)
    assert.match(missingCustRes.body.message, /Customer was not found/i)

    // Invalid quantity (< 1, > 1000, decimal)
    const badQtyRes1 = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, quantity: 0 },
      user: mockCashier,
    })
    assert.equal(badQtyRes1.status, 400)
    assert.match(badQtyRes1.body.message, /Quantity must be between 1 and 1,000/i)

    const badQtyRes2 = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, quantity: 1.5 },
      user: mockCashier,
    })
    assert.equal(badQtyRes2.status, 400)
    assert.match(badQtyRes2.body.message, /Quantity must be between 1 and 1,000/i)

    // Invalid payment method
    const badPayMethodRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, paymentMethod: 'CRYPTO' },
      user: mockCashier,
    })
    assert.equal(badPayMethodRes.status, 400)
    assert.match(badPayMethodRes.body.message, /Choose a valid payment method/i)
  } finally {
    ServiceOffering.findById = origFindById
    Customer.findById = origCustomerFindById
  }
})

test('Service charge creation: validates discount limits (percent > 100% or discount > subtotal)', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById

  ServiceOffering.findById = async () => ({
    _id: fakeId,
    name: 'Gmail Setup',
    currency: 'USD',
    price: 10,
    priceUsd: 10,
    priceKhr: 41000,
    active: true,
  })

  try {
    // Discount percent > 100%
    const over100PercentRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, discountType: 'PERCENT', discount: 150 },
      user: mockCashier,
    })
    assert.equal(over100PercentRes.status, 400)
    assert.match(over100PercentRes.body.message, /Discount percentage cannot exceed 100%/i)

    // Discount amount > subtotal
    const overSubtotalRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: { offeringId: fakeId, discountType: 'AMOUNT', discount: 25 },
      user: mockCashier,
    })
    assert.equal(overSubtotalRes.status, 400)
    assert.match(overSubtotalRes.body.message, /Discount cannot exceed the service subtotal/i)
  } finally {
    ServiceOffering.findById = origFindById
  }
})

test('Service charge creation: accurately calculates subtotal, discount, and total for USD & KHR', async () => {
  const fakeId = new mongoose.Types.ObjectId()
  const origFindById = ServiceOffering.findById
  const origChargeCreate = ServiceCharge.create

  ServiceOffering.findById = async () => ({
    _id: fakeId,
    code: 'APPLE_ID_SETUP',
    name: 'Apple ID setup',
    category: 'ACCOUNT_SETUP',
    description: 'Create Apple ID',
    currency: 'USD',
    price: 10,
    priceUsd: 10,
    priceKhr: 41000,
    pricingExchangeRate: 4100,
    active: true,
  })

  let createdRecord = null
  ServiceCharge.create = async (doc) => {
    createdRecord = {
      _id: new mongoose.Types.ObjectId(),
      ...doc,
      populate: async function () { return this },
    }
    return createdRecord
  }

  try {
    // 1. USD charge with 20% discount on quantity 2
    // Unit price = $10, Quantity = 2, Subtotal = $20, Discount = $4, Total = $16
    const usdRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: {
        offeringId: fakeId,
        currency: 'USD',
        quantity: 2,
        discountType: 'PERCENT',
        discount: 20,
        customerName: 'Alice Walkin',
        paymentMethod: 'CASH',
        notes: 'Assisted with two-factor setup',
      },
      user: mockCashier,
    })
    assert.equal(usdRes.status, 201)
    assert.equal(createdRecord.unitPrice, 10)
    assert.equal(createdRecord.quantity, 2)
    assert.equal(createdRecord.subtotal, 20)
    assert.equal(createdRecord.discount, 4)
    assert.equal(createdRecord.total, 16)
    assert.equal(createdRecord.customerSnapshot.name, 'Alice Walkin')
    assert.match(createdRecord.serviceNo, /^SV-\d{8}-[A-Z0-9]{5}$/)

    // 2. KHR charge with 1,000 KHR discount on quantity 1
    // Unit price = 41,000 KHR, Quantity = 1, Subtotal = 41,000 KHR, Discount = 1,000 KHR, Total = 40,000 KHR
    const khrRes = await callRouter(serviceRouter, {
      method: 'POST',
      url: '/charges',
      body: {
        offeringId: fakeId,
        currency: 'KHR',
        quantity: 1,
        discountType: 'AMOUNT',
        discount: 1000,
        paymentMethod: 'KHQR',
      },
      user: mockCashier,
    })
    assert.equal(khrRes.status, 201)
    assert.equal(createdRecord.unitPrice, 41000)
    assert.equal(createdRecord.subtotal, 41000)
    assert.equal(createdRecord.discount, 1000)
    assert.equal(createdRecord.total, 40000)
    assert.equal(createdRecord.currency, 'KHR')
    assert.equal(createdRecord.exchangeRate, 4100)
    assert.equal(createdRecord.customerSnapshot.name, 'Walk-in customer')
  } finally {
    ServiceOffering.findById = origFindById
    ServiceCharge.create = origChargeCreate
  }
})
