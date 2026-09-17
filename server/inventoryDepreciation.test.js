import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { ActivityLog, InventoryItem, Pawn, PaywayIntent, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import router from './routes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-inventory-depreciation-tests'

const testUserId = new mongoose.Types.ObjectId()
const testSessionId = 'inv-dep-test-session-1'

let currentUserRole = 'MANAGER'

function createTestToken(userId = testUserId, sessionId = testSessionId) {
  return jwt.sign(
    { sub: userId.toString(), sid: sessionId },
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
  )
}

const defaultToken = createTestToken()

// Helper to simulate an Express request through the main router
async function callRoute(method, path, body = {}, { token = defaultToken, role = currentUserRole } = {}) {
  currentUserRole = role

  return new Promise((resolve) => {
    const [pathPart, queryPart = ''] = path.split('?')
    const queryParams = Object.fromEntries(new URLSearchParams(queryPart))

    const req = {
      method,
      url: path,
      path: pathPart,
      params: {},
      query: queryParams,
      body,
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
      get(header) {
        return this.headers[header.toLowerCase()]
      },
      ip: '127.0.0.1',
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
        return this
      },
      cookie() {},
      clearCookie() {},
      setHeader() {},
      getHeader() {},
      set() {},
    }

    router.handle(req, res, (err) => {
      if (err) {
        resolve({ status: err.status || 500, body: { message: err.message } })
      } else {
        resolve({ status: responseStatus, body: responseData })
      }
    })
  })
}

// Setup and teardown auth mocking for router
const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
const origActivityLogSave = ActivityLog.prototype.save

test.beforeEach(() => {
  currentUserRole = 'MANAGER'

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
      name: 'Test Staff',
      email: 'staff@phoneflow.test',
      role: currentUserRole,
      active: true,
    }),
  })
  ActivityLog.prototype.save = async function () { return this }
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById
  ActivityLog.prototype.save = origActivityLogSave
})

test('Authentication and RBAC: enforces permissions across inventory and valuation routes', async () => {
  const sampleItemId = new mongoose.Types.ObjectId().toString()

  // 1. Unauthenticated requests must return 401
  const unauthGet = await callRoute('GET', '/inventory', {}, { token: null })
  assert.equal(unauthGet.status, 401, 'GET /inventory without auth must return 401')

  const unauthPost = await callRoute('POST', '/inventory', {}, { token: null })
  assert.equal(unauthPost.status, 401, 'POST /inventory without auth must return 401')

  const unauthPatch = await callRoute('PATCH', `/inventory/${sampleItemId}`, {}, { token: null })
  assert.equal(unauthPatch.status, 401, 'PATCH /inventory/:id without auth must return 401')

  const unauthAdjust = await callRoute('POST', `/inventory/${sampleItemId}/adjust`, {}, { token: null })
  assert.equal(unauthAdjust.status, 401, 'POST /inventory/:id/adjust without auth must return 401')

  const unauthDelete = await callRoute('DELETE', `/inventory/${sampleItemId}`, {}, { token: null })
  assert.equal(unauthDelete.status, 401, 'DELETE /inventory/:id without auth must return 401')

  const unauthValuation = await callRoute('POST', '/valuation/calculate', {}, { token: null })
  assert.equal(unauthValuation.status, 401, 'POST /valuation/calculate without auth must return 401')

  // 2. CASHIER role: allowed for GET /inventory and POST /valuation/calculate, forbidden (403) for writes
  const origFind = InventoryItem.find
  const origPawnFind = Pawn.find
  try {
    InventoryItem.find = () => ({
      sort: () => ({
        limit: () => Promise.resolve([]),
      }),
    })
    Pawn.find = () => ({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    })

    const cashierGet = await callRoute('GET', '/inventory', {}, { role: 'CASHIER' })
    assert.equal(cashierGet.status, 200, 'GET /inventory must be accessible to CASHIER')

    const cashierValuation = await callRoute('POST', '/valuation/calculate', { marketPrice: 500 }, { role: 'CASHIER' })
    assert.equal(cashierValuation.status, 200, 'POST /valuation/calculate must be accessible to CASHIER')
  } finally {
    InventoryItem.find = origFind
    Pawn.find = origPawnFind
  }

  const cashierPost = await callRoute('POST', '/inventory', {}, { role: 'CASHIER' })
  assert.equal(cashierPost.status, 403, 'POST /inventory must reject CASHIER with 403')

  const cashierPatch = await callRoute('PATCH', `/inventory/${sampleItemId}`, { sellPrice: 200 }, { role: 'CASHIER' })
  assert.equal(cashierPatch.status, 403, 'PATCH /inventory/:id must reject CASHIER with 403')

  const cashierAdjust = await callRoute('POST', `/inventory/${sampleItemId}/adjust`, {}, { role: 'CASHIER' })
  assert.equal(cashierAdjust.status, 403, 'POST /inventory/:id/adjust must reject CASHIER with 403')

  const cashierPhoto = await callRoute('POST', `/inventory/${sampleItemId}/photo`, {}, { role: 'CASHIER' })
  assert.equal(cashierPhoto.status, 403, 'POST /inventory/:id/photo must reject CASHIER with 403')

  const cashierDeletePhoto = await callRoute('DELETE', `/inventory/${sampleItemId}/photo`, {}, { role: 'CASHIER' })
  assert.equal(cashierDeletePhoto.status, 403, 'DELETE /inventory/:id/photo must reject CASHIER with 403')

  const cashierDelete = await callRoute('DELETE', `/inventory/${sampleItemId}`, {}, { role: 'CASHIER' })
  assert.equal(cashierDelete.status, 403, 'DELETE /inventory/:id must reject CASHIER with 403')

  const stockDelete = await callRoute('DELETE', `/inventory/${sampleItemId}`, {}, { role: 'STOCK' })
  assert.equal(stockDelete.status, 403, 'DELETE /inventory/:id must reject STOCK with 403')

  const managerDelete = await callRoute('DELETE', `/inventory/${sampleItemId}`, {}, { role: 'MANAGER' })
  assert.equal(managerDelete.status, 403, 'DELETE /inventory/:id must reject MANAGER with 403 (OWNER only)')
})

test('POST /inventory: validates storage and RAM constraints on item creation', async () => {
  // PHONE without positive storage should be rejected
  const resPhoneNoStorage = await callRoute('POST', '/inventory', {
    name: 'iPhone 13',
    category: 'PHONE',
    brand: 'Apple',
    model: 'iPhone 13',
    storage: 'invalid',
  }, { role: 'STOCK' })
  assert.equal(resPhoneNoStorage.status, 400)
  assert.match(resPhoneNoStorage.body.message, /Storage must be a positive GB value/i)

  // Invalid RAM should be rejected
  const resInvalidRam = await callRoute('POST', '/inventory', {
    name: 'Samsung S22',
    category: 'PHONE',
    brand: 'Samsung',
    model: 'S22',
    storage: 128,
    ram: 'abc',
  }, { role: 'STOCK' })
  assert.equal(resInvalidRam.status, 400)
  assert.match(resInvalidRam.body.message, /RAM must be a positive GB value/i)

  // Valid item creation succeeds
  const origCreate = InventoryItem.create
  try {
    let createdPayload = null
    InventoryItem.create = async (payload) => {
      createdPayload = payload
      return {
        _id: new mongoose.Types.ObjectId(),
        ...payload,
        save: async () => {},
      }
    }

    const resValid = await callRoute('POST', '/inventory', {
      name: 'iPhone 13 128GB Blue',
      category: 'PHONE',
      brand: 'Apple',
      model: 'iPhone 13',
      storage: '128 GB',
      ram: '4GB',
      buyPrice: 300,
      sellPrice: 450,
      quantity: 1,
      status: 'IN_STOCK',
    }, { role: 'MANAGER' })

    assert.equal(resValid.status, 201)
    assert.equal(createdPayload.storage, '128GB')
    assert.equal(createdPayload.ram, '4GB')
    assert.equal(createdPayload.category, 'PHONE')
    assert.ok(createdPayload.sku, 'Auto-generates SKU if not provided')
  } finally {
    InventoryItem.create = origCreate
  }
})

test('POST /inventory/:id/adjust: enforces serialized phone adjustment constraints', async () => {
  const phoneId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById
  const origFindOneAndUpdate = InventoryItem.findOneAndUpdate

  try {
    // 1. Non-existent item
    InventoryItem.findById = async () => null
    const resNotFound = await callRoute('POST', `/inventory/${phoneId}/adjust`, {
      mode: 'STATUS',
      reason: 'DAMAGED',
      status: 'REPAIR',
    })
    assert.equal(resNotFound.status, 404)

    // 2. Phone must use mode: 'STATUS', reject 'ADD', 'REMOVE', or 'SET'
    InventoryItem.findById = async () => ({
      _id: phoneId,
      name: 'iPhone 12',
      category: 'PHONE',
      quantity: 1,
      status: 'IN_STOCK',
    })

    const resAddPhone = await callRoute('POST', `/inventory/${phoneId}/adjust`, {
      mode: 'ADD',
      quantity: 1,
      reason: 'COUNT_CORRECTION',
    })
    assert.equal(resAddPhone.status, 400)
    assert.match(resAddPhone.body.message, /Choose an available, repair, or archived status for this phone/i)

    // 3. Rejects identical status
    const resSameStatus = await callRoute('POST', `/inventory/${phoneId}/adjust`, {
      mode: 'STATUS',
      reason: 'COUNT_CORRECTION',
      status: 'IN_STOCK',
    })
    assert.equal(resSameStatus.status, 400)
    assert.match(resSameStatus.body.message, /Choose a status different from the current status/i)

    // 4. Rejects adjusting a phone currently in PAWNED, RESERVED, or SOLD status
    InventoryItem.findById = async () => ({
      _id: phoneId,
      name: 'iPhone 12',
      category: 'PHONE',
      quantity: 1,
      status: 'PAWNED',
    })

    const resPawned = await callRoute('POST', `/inventory/${phoneId}/adjust`, {
      mode: 'STATUS',
      reason: 'COUNT_CORRECTION',
      status: 'ARCHIVED',
    })
    assert.equal(resPawned.status, 409)
    assert.match(resPawned.body.message, /must be updated through its related transaction/i)

    // 5. Successful phone status change keeps quantity = 1
    InventoryItem.findById = async () => ({
      _id: phoneId,
      name: 'iPhone 12',
      category: 'PHONE',
      quantity: 1,
      status: 'IN_STOCK',
    })
    let updateFilter = null
    let updateDoc = null
    InventoryItem.findOneAndUpdate = async (filter, update) => {
      updateFilter = filter
      updateDoc = update
      return {
        _id: phoneId,
        quantity: update.quantity,
        status: update.status,
        sku: 'STK-001',
      }
    }

    const resSuccess = await callRoute('POST', `/inventory/${phoneId}/adjust`, {
      mode: 'STATUS',
      reason: 'DAMAGED',
      status: 'REPAIR',
      notes: 'Screen cracked during inspection',
    })
    assert.equal(resSuccess.status, 200)
    assert.equal(updateDoc.quantity, 1, 'Phone quantity must always remain 1')
    assert.equal(updateDoc.status, 'REPAIR')
    assert.equal(updateFilter.status, 'IN_STOCK', 'Enforces optimistic concurrency on status')
  } finally {
    InventoryItem.findById = origFindById
    InventoryItem.findOneAndUpdate = origFindOneAndUpdate
  }
})

test('POST /inventory/:id/adjust: enforces quantity-based stock rules and optimistic concurrency', async () => {
  const accessoryId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById
  const origFindOneAndUpdate = InventoryItem.findOneAndUpdate

  try {
    InventoryItem.findById = async () => ({
      _id: accessoryId,
      name: 'USB-C Cable',
      category: 'ACCESSORY',
      quantity: 10,
      status: 'IN_STOCK',
    })

    // 1. Invalid adjustment reason
    const resBadReason = await callRoute('POST', `/inventory/${accessoryId}/adjust`, {
      mode: 'ADD',
      quantity: 5,
      reason: 'INVALID_REASON',
    })
    assert.equal(resBadReason.status, 400)
    assert.match(resBadReason.body.message, /Select a valid adjustment reason/i)

    // 2. Note > 500 characters rejected
    const resLongNote = await callRoute('POST', `/inventory/${accessoryId}/adjust`, {
      mode: 'ADD',
      quantity: 5,
      reason: 'COUNT_CORRECTION',
      notes: 'A'.repeat(501),
    })
    assert.equal(resLongNote.status, 400)
    assert.match(resLongNote.body.message, /500 characters/i)

    // 3. Reducing stock below zero is rejected
    const resBelowZero = await callRoute('POST', `/inventory/${accessoryId}/adjust`, {
      mode: 'REMOVE',
      quantity: 15,
      reason: 'DAMAGED',
    })
    assert.equal(resBelowZero.status, 400)
    assert.match(resBelowZero.body.message, /cannot reduce stock below zero/i)

    // 4. Zero delta adjustment is rejected
    const resNoChange = await callRoute('POST', `/inventory/${accessoryId}/adjust`, {
      mode: 'SET',
      quantity: 10,
      reason: 'COUNT_CORRECTION',
    })
    assert.equal(resNoChange.status, 400)
    assert.match(resNoChange.body.message, /does not change the current quantity/i)

    // 5. Quantity reaching zero transitions status to ARCHIVED
    InventoryItem.findOneAndUpdate = async (_filter, update) => ({
      _id: accessoryId,
      quantity: update.quantity,
      status: update.status,
      sku: 'ACC-001',
    })

    const resZeroStock = await callRoute('POST', `/inventory/${accessoryId}/adjust`, {
      mode: 'SET',
      quantity: 0,
      reason: 'LOST',
    })
    assert.equal(resZeroStock.status, 200)
    assert.equal(resZeroStock.body.item.quantity, 0)
    assert.equal(resZeroStock.body.item.status, 'ARCHIVED')

    // 6. Optimistic concurrency conflict returns 409
    InventoryItem.findOneAndUpdate = async () => null // Simulates concurrent write changing quantity
    const resConflict = await callRoute('POST', `/inventory/${accessoryId}/adjust`, {
      mode: 'ADD',
      quantity: 5,
      reason: 'FOUND',
    })
    assert.equal(resConflict.status, 409)
    assert.match(resConflict.body.message, /Inventory changed while you were editing/i)
  } finally {
    InventoryItem.findById = origFindById
    InventoryItem.findOneAndUpdate = origFindOneAndUpdate
  }
})

test('PATCH /inventory/:id: enforces price constraints without mutating stock quantity', async () => {
  const itemId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById
  const origFindByIdAndUpdate = InventoryItem.findByIdAndUpdate

  try {
    InventoryItem.findById = () => ({
      select: () => Promise.resolve({
        _id: itemId,
        sellPrice: 400,
        minimumSellPrice: 350,
        pricingCurrency: 'USD',
        pricingExchangeRate: 4100,
        quantity: 5,
        status: 'IN_STOCK',
      }),
    })

    // 1. Missing price fields
    const resNoPrices = await callRoute('PATCH', `/inventory/${itemId}`, {
      name: 'New Name',
    })
    assert.equal(resNoPrices.status, 400)
    assert.match(resNoPrices.body.message, /Use the stock adjustment, photo, purchase, sale, or pawn workflow/i)

    // 2. Invalid currency code
    const resBadCurrency = await callRoute('PATCH', `/inventory/${itemId}`, {
      currency: 'EUR',
      sellPrice: 500,
    })
    assert.equal(resBadCurrency.status, 400)
    assert.match(resBadCurrency.body.message, /Pricing currency must be USD or KHR/i)

    // 3. Minimum price > regular selling price rejected
    const resMinAboveRegular = await callRoute('PATCH', `/inventory/${itemId}`, {
      currency: 'USD',
      sellPrice: 300,
      minimumSellPrice: 350,
    })
    assert.equal(resMinAboveRegular.status, 400)
    assert.match(resMinAboveRegular.body.message, /minimum price cannot exceed the regular price/i)

    // 4. Successful price update updates prices and preserves stock quantity
    let savedUpdate = null
    InventoryItem.findByIdAndUpdate = async (_id, update) => {
      savedUpdate = update
      return {
        _id: itemId,
        ...update,
        quantity: 5, // Quantity untouched
        status: 'IN_STOCK',
      }
    }

    const resSuccess = await callRoute('PATCH', `/inventory/${itemId}`, {
      currency: 'USD',
      sellPrice: 450,
      minimumSellPrice: 400,
    })
    assert.equal(resSuccess.status, 200)
    assert.equal(savedUpdate.sellPrice, 450)
    assert.equal(savedUpdate.minimumSellPrice, 400)
    assert.equal(savedUpdate.quantity, undefined, 'Price update must not touch quantity field')
    assert.equal(savedUpdate.status, undefined, 'Price update must not touch status field')
    assert.equal(resSuccess.body.item.quantity, 5)
  } finally {
    InventoryItem.findById = origFindById
    InventoryItem.findByIdAndUpdate = origFindByIdAndUpdate
  }
})

test('POST /valuation/calculate: verifies business logic formulas without database mutation', async () => {
  // 1. Independent formula verification:
  // marketPrice = 600
  // ageMonths = 12 -> 12 * 0.0125 = 0.15 (15%) -> 600 * 0.15 = 90
  // condition = 'good' -> 0.12 (12%) -> 600 * 0.12 = 72
  // batteryHealth = 85 -> 0% -> 0
  // accessoriesIncluded = ['BOX', 'CHARGER', 'CABLE'] -> 0% -> 0
  // repairCost = 30
  // estimatedValue = 600 - 90 - 72 - 0 - 0 - 30 = 408
  // pawnRate = 45% -> 408 * 0.45 = 183.6
  const res = await callRoute('POST', '/valuation/calculate', {
    currency: 'USD',
    marketPrice: 600,
    ageMonths: 12,
    condition: 'good',
    batteryHealth: 85,
    lockStatus: 'unlocked',
    accessoriesIncluded: ['BOX', 'CHARGER', 'CABLE'],
    repairCost: 30,
    pawnRate: 45,
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.eligible, true)
  assert.equal(res.body.marketPrice, 600)
  assert.equal(res.body.ageDeduction, 90)
  assert.equal(res.body.conditionDeduction, 72)
  assert.equal(res.body.batteryDeduction, 0)
  assert.equal(res.body.accessoryDeduction, 0)
  assert.equal(res.body.carrierLockDeduction, 0)
  assert.equal(res.body.repairCost, 30)
  assert.equal(res.body.estimatedValue, 408)
  assert.equal(res.body.maximumPawn, 183.6)

  // 2. Activation locked phones: must be marked ineligible and offer zero
  const resLocked = await callRoute('POST', '/valuation/calculate', {
    currency: 'USD',
    marketPrice: 800,
    lockStatus: 'activation_locked',
  })
  assert.equal(resLocked.status, 200)
  assert.equal(resLocked.body.eligible, false)
  assert.equal(resLocked.body.estimatedValue, 0)
  assert.equal(resLocked.body.maximumPawn, 0)

  // 3. Carrier locked phones: 10% deduction
  const resCarrierLocked = await callRoute('POST', '/valuation/calculate', {
    currency: 'USD',
    marketPrice: 500,
    ageMonths: 0,
    condition: 'new',
    batteryHealth: 100,
    lockStatus: 'carrier_locked',
  })
  assert.equal(resCarrierLocked.status, 200)
  assert.equal(resCarrierLocked.body.carrierLockDeduction, 50) // 10% of 500
  assert.equal(resCarrierLocked.body.estimatedValue, 450)

  // 4. Missing accessories deductions
  // No charger or cable = 3% deduction
  const resMissingCharger = await callRoute('POST', '/valuation/calculate', {
    currency: 'USD',
    marketPrice: 1000,
    ageMonths: 0,
    condition: 'new',
    batteryHealth: 100,
    accessoriesIncluded: ['BOX'],
  })
  assert.equal(resMissingCharger.body.accessoryDeduction, 30) // 3% of 1000

  // 5. Zero market price: returns 0 without NaN
  const resZero = await callRoute('POST', '/valuation/calculate', {
    currency: 'USD',
    marketPrice: 0,
  })
  assert.equal(resZero.body.estimatedValue, 0)
  assert.equal(resZero.body.maximumPawn, 0)
  assert.equal(Number.isNaN(resZero.body.estimatedValue), false)

  // 6. Cambodian Riel (KHR): rounded to nearest 100 KHR
  const resKhr = await callRoute('POST', '/valuation/calculate', {
    currency: 'KHR',
    marketPrice: 2000000,
    ageMonths: 12,
    condition: 'good',
    batteryHealth: 85,
    pawnRate: 45,
  })
  assert.equal(resKhr.body.currency, 'KHR')
  assert.equal(resKhr.body.marketPrice % 100, 0)
  assert.equal(resKhr.body.estimatedValue % 100, 0)
  assert.equal(resKhr.body.maximumPawn % 100, 0)

  // 7. Manual mode preserves manual estimated value when eligible
  const resManual = await callRoute('POST', '/valuation/calculate', {
    calculationMode: 'MANUAL',
    currency: 'USD',
    marketPrice: 500,
    estimatedValue: 350,
    pawnRate: 50,
  })
  assert.equal(resManual.body.calculationMode, 'MANUAL')
  assert.equal(resManual.body.estimatedValue, 350)
  assert.equal(resManual.body.maximumPawn, 175)
})

test('GET /inventory: filters by category, status, low-stock threshold, and search query', async () => {
  const origFind = InventoryItem.find
  const origPawnFind = Pawn.find
  let capturedFilter = null

  try {
    InventoryItem.find = (filter) => {
      capturedFilter = filter
      return {
        sort: () => ({
          limit: () => Promise.resolve([
            {
              _id: new mongoose.Types.ObjectId(),
              name: 'iPhone 13',
              category: 'PHONE',
              quantity: 1,
              toObject: () => ({ name: 'iPhone 13' }),
            },
          ]),
        }),
      }
    }
    Pawn.find = () => ({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    })

    // Filter by category and status
    const resFilter = await callRoute('GET', '/inventory?category=PHONE&status=IN_STOCK')
    assert.equal(resFilter.status, 200)
    assert.equal(capturedFilter.category, 'PHONE')
    assert.equal(capturedFilter.status, 'IN_STOCK')

    // Low stock filter applies $expr
    await callRoute('GET', '/inventory?lowStock=true')
    assert.deepEqual(capturedFilter.$expr, { $lte: ['$quantity', '$reorderLevel'] })

    // Search query matches name, brand, model, SKU, barcode, IMEI
    await callRoute('GET', '/inventory?q=samsung')
    assert.ok(Array.isArray(capturedFilter.$or))
    assert.equal(capturedFilter.$or.length, 7)
  } finally {
    InventoryItem.find = origFind
    Pawn.find = origPawnFind
  }
})

test('GET /inventory/scan/:code: looks up products and related pawn contracts', async () => {
  const origFindOne = InventoryItem.findOne
  const origPawnFindOne = Pawn.findOne

  try {
    // 1. Missing or whitespace code
    const resEmpty = await callRoute('GET', '/inventory/scan/%20')
    assert.equal(resEmpty.status, 400)
    assert.match(resEmpty.body.message, /Scan a barcode, SKU, IMEI/i)

    // 2. Direct inventory match
    const testItemId = new mongoose.Types.ObjectId()
    InventoryItem.findOne = async () => ({
      _id: testItemId,
      name: 'Pixel 7',
      sku: 'STK-PIXEL7',
      barcode: 'PF-12345',
    })
    Pawn.findOne = () => ({
      select: () => ({
        populate: () => ({
          lean: () => Promise.resolve(null),
        }),
      }),
    })

    const resDirect = await callRoute('GET', '/inventory/scan/PF-12345')
    assert.equal(resDirect.status, 200)
    assert.equal(resDirect.body.item.name, 'Pixel 7')
    assert.equal(resDirect.body.relatedPawn, null)

    // 3. Pawn match when item is not found directly
    InventoryItem.findOne = async () => null
    Pawn.findOne = () => ({
      select: () => ({
        populate: () => ({
          populate: () => ({
            lean: () => Promise.resolve({
              pawnNo: 'PW-2026-999',
              status: 'ACTIVE',
              inventoryItem: {
                _id: testItemId,
                name: 'Pawned Galaxy S21',
              },
            }),
          }),
        }),
      }),
    })

    const resPawn = await callRoute('GET', '/inventory/scan/PW-2026-999')
    assert.equal(resPawn.status, 200)
    assert.equal(resPawn.body.item.name, 'Pawned Galaxy S21')
    assert.equal(resPawn.body.relatedPawn.pawnNo, 'PW-2026-999')

    // 4. Code not found anywhere returns 404
    Pawn.findOne = () => ({
      select: () => ({
        populate: () => ({
          populate: () => ({
            lean: () => Promise.resolve(null),
          }),
        }),
      }),
    })

    const resNotFound = await callRoute('GET', '/inventory/scan/UNKNOWN-CODE')
    assert.equal(resNotFound.status, 404)
    assert.match(resNotFound.body.message, /No product or pawn found/i)
  } finally {
    InventoryItem.findOne = origFindOne
    Pawn.findOne = origPawnFindOne
  }
})

test('PATCH /inventory/:id: supports dual-currency prices and rejects if minimum exceeds regular in KHR', async () => {
  const itemId = new mongoose.Types.ObjectId()
  const origFindById = InventoryItem.findById
  const origFindByIdAndUpdate = InventoryItem.findByIdAndUpdate

  try {
    InventoryItem.findById = () => ({
      select: () => Promise.resolve({
        _id: itemId,
        sellPrice: 500,
        minimumSellPrice: 450,
        khrSellPrice: 2050000,
        khrMinimumSellPrice: 1845000,
        pricingCurrency: 'USD',
        pricingExchangeRate: 4100,
        quantity: 2,
        status: 'IN_STOCK',
      }),
    })

    // Rejects when KHR minimum price exceeds KHR regular selling price
    const resKhrMinExceeds = await callRoute('PATCH', `/inventory/${itemId}`, {
      sellPriceUsd: 500,
      minimumSellPriceUsd: 450,
      sellPriceKhr: 2000000,
      minimumSellPriceKhr: 2100000, // Invalid: exceeds regular
    })
    assert.equal(resKhrMinExceeds.status, 400)
    assert.match(resKhrMinExceeds.body.message, /The minimum price cannot exceed the regular price/i)

    // Valid dual-currency update succeeds
    let appliedUpdate = null
    InventoryItem.findByIdAndUpdate = async (_id, update) => {
      appliedUpdate = update
      return {
        _id: itemId,
        ...update,
        quantity: 2,
      }
    }

    const resValid = await callRoute('PATCH', `/inventory/${itemId}`, {
      sellPriceUsd: 520,
      minimumSellPriceUsd: 480,
      sellPriceKhr: 2132000,
      minimumSellPriceKhr: 1968000,
    })
    assert.equal(resValid.status, 200)
    assert.equal(appliedUpdate.sellPrice, 520)
    assert.equal(appliedUpdate.minimumSellPrice, 480)
    assert.equal(appliedUpdate.khrSellPrice, 2132000)
    assert.equal(appliedUpdate.khrMinimumSellPrice, 1968000)
  } finally {
    InventoryItem.findById = origFindById
    InventoryItem.findByIdAndUpdate = origFindByIdAndUpdate
  }
})

test('DELETE /inventory/:id: enforces validation, reference guards, photo cleanup, activity logging, and safe hard-deletion for OWNER', async () => {
  const origFindById = InventoryItem.findById
  const origFindByIdAndDelete = InventoryItem.findByIdAndDelete
  const origPawnFindOne = Pawn.findOne
  const origTradeFindOne = Trade.findOne
  const origPaywayIntentFindOne = PaywayIntent.findOne
  const origActivitySave = ActivityLog.prototype.save

  const validId = new mongoose.Types.ObjectId().toString()

  try {
    // 1. Invalid MongoDB ObjectId -> 400
    const resInvalidId = await callRoute('DELETE', '/inventory/not-a-valid-id', {}, { role: 'OWNER' })
    assert.equal(resInvalidId.status, 400)
    assert.match(resInvalidId.body.message, /Invalid inventory item ID/i)

    // 2. Item not found -> 404
    InventoryItem.findById = () => ({
      select: async () => null,
    })
    const resNotFound = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resNotFound.status, 404)
    assert.match(resNotFound.body.message, /Inventory item not found/i)

    // Base mock item
    const baseItem = {
      _id: validId,
      sku: 'STK-ORPHAN-01',
      name: 'Orphan Phone Case',
      category: 'ACCESSORY',
      status: 'IN_STOCK',
      quantity: 1,
      imagekitFileId: 'img_test_123',
    }

    // 3. Linked to active pawn -> 409
    InventoryItem.findById = () => ({
      select: async () => ({ ...baseItem }),
    })
    Pawn.findOne = () => ({
      select: () => ({
        lean: async () => ({ pawnNo: 'PW-2026-001', status: 'OPEN' }),
      }),
    })
    Trade.findOne = () => ({ select: () => ({ lean: async () => null }) })
    PaywayIntent.findOne = () => ({ select: () => ({ lean: async () => null }) })

    const resLinkedPawnActive = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resLinkedPawnActive.status, 409)
    assert.match(resLinkedPawnActive.body.message, /linked to active pawn contract #PW-2026-001/i)

    // 4. Linked to historical (redeemed) pawn -> 409 with archive guidance
    Pawn.findOne = () => ({
      select: () => ({
        lean: async () => ({ pawnNo: 'PW-2026-002', status: 'REDEEMED' }),
      }),
    })
    const resLinkedPawnHist = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resLinkedPawnHist.status, 409)
    assert.match(resLinkedPawnHist.body.message, /Archive this record instead/i)

    // 5. Linked to trade (BUY / purchase) -> 409
    Pawn.findOne = () => ({ select: () => ({ lean: async () => null }) })
    Trade.findOne = () => ({
      select: () => ({
        lean: async () => ({ tradeNo: 'TR-BUY-99', type: 'BUY' }),
      }),
    })
    const resLinkedTrade = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resLinkedTrade.status, 409)
    assert.match(resLinkedTrade.body.message, /linked to recorded purchase transaction #TR-BUY-99/i)
    assert.match(resLinkedTrade.body.message, /Archive this record instead/i)

    // 6. Linked to in-flight PaywayIntent -> 409
    Trade.findOne = () => ({ select: () => ({ lean: async () => null }) })
    PaywayIntent.findOne = () => ({
      select: () => ({
        lean: async () => ({ transactionId: 'TX-PAY-555', status: 'PENDING' }),
      }),
    })
    const resLinkedPayway = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resLinkedPayway.status, 409)
    assert.match(resLinkedPayway.body.message, /in-flight or completed KHQR transaction #TX-PAY-555/i)

    // 7. Non-deletable status (e.g. SOLD or RESERVED) -> 409
    PaywayIntent.findOne = () => ({ select: () => ({ lean: async () => null }) })
    InventoryItem.findById = () => ({
      select: async () => ({ ...baseItem, status: 'SOLD' }),
    })
    const resSold = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resSold.status, 409)
    assert.match(resSold.body.message, /currently marked as sold/i)

    // 8. Safe orphan hard deletion succeeds
    let deletedIdCalled = null
    InventoryItem.findById = () => ({
      select: async () => ({ ...baseItem, status: 'IN_STOCK' }),
    })
    InventoryItem.findByIdAndDelete = async (id) => {
      deletedIdCalled = String(id)
      return { _id: id }
    }

    let recordedActivity = null
    ActivityLog.prototype.save = async function () {
      recordedActivity = this
      return this
    }

    const resSuccess = await callRoute('DELETE', `/inventory/${validId}`, {}, { role: 'OWNER' })
    assert.equal(resSuccess.status, 200)
    assert.equal(resSuccess.body.deletedId, validId)
    assert.equal(resSuccess.body.sku, 'STK-ORPHAN-01')
    assert.match(resSuccess.body.message, /Stock record deleted successfully/i)
    assert.equal(deletedIdCalled, validId)
  } finally {
    InventoryItem.findById = origFindById
    InventoryItem.findByIdAndDelete = origFindByIdAndDelete
    Pawn.findOne = origPawnFindOne
    Trade.findOne = origTradeFindOne
    PaywayIntent.findOne = origPaywayIntentFindOne
    ActivityLog.prototype.save = origActivitySave
  }
})

test('POST /inventory: sanitizes bad SKU and barcode values and prevents literal "NULL" in inventory', async () => {
  const origCreate = InventoryItem.create
  let createdPayload = null
  InventoryItem.create = async (data) => {
    createdPayload = data
    return {
      _id: 'mock-item-sanitized',
      ...data,
      save: async () => {},
    }
  }
  try {
    const res = await callRoute('POST', '/inventory', {
      name: 'Samsung Galaxy S24 Ultra',
      category: 'PHONE',
      brand: 'Samsung',
      model: 'S24 Ultra',
      storage: '256GB',
      sku: 'NULL',
      barcode: 'NULL',
      buyPrice: 600,
      sellPrice: 900,
      quantity: 1,
      status: 'IN_STOCK',
    }, { role: 'MANAGER' })

    assert.equal(res.status, 201)
    assert.notEqual(createdPayload.sku, 'NULL', 'Must not store literal string "NULL" as SKU')
    assert.match(createdPayload.sku, /^STK-/, 'Auto-generates clean STK- SKU')
    assert.notEqual(createdPayload.barcode, 'NULL', 'Must not store literal string "NULL" as barcode')
    assert.match(createdPayload.barcode, /^PF-/, 'Auto-generates clean PF- barcode')
  } finally {
    InventoryItem.create = origCreate
  }
})

test('GET /inventory/scan/:code: rejects literal "NULL" or blank code with 400 Bad Request', async () => {
  const resNull = await callRoute('GET', '/inventory/scan/NULL', {}, { role: 'CASHIER' })
  assert.equal(resNull.status, 400)
  assert.match(resNull.body.message, /Scan a barcode, SKU, IMEI/i)

  const resLowerNull = await callRoute('GET', '/inventory/scan/null', {}, { role: 'CASHIER' })
  assert.equal(resLowerNull.status, 400)
  assert.match(resLowerNull.body.message, /Scan a barcode, SKU, IMEI/i)
})
