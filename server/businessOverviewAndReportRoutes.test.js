import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { ActivityLog, Customer, InventoryItem, Pawn, Trade, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Loan } from './loanModels.js'
import appRouter from './routes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-business-reports'
const testUserId = new mongoose.Types.ObjectId()
const testSessionId = 'overview-test-session-1'

function createToken(role = 'MANAGER', userId = testUserId) {
  return jwt.sign(
    { sub: userId.toString(), sid: testSessionId, role },
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
  )
}

async function callRoute(path, query = {}, token = createToken('MANAGER')) {
  return new Promise((resolve, reject) => {
    const req = {
      method: 'GET',
      url: path + (Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : ''),
      query,
      headers: token ? { authorization: `Bearer ${token}` } : {},
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

    appRouter.handle(req, res, (err) => {
      if (err) {
        if (err.status) {
          resolve({ status: err.status, body: { message: err.message } })
        } else {
          reject(err)
        }
      } else {
        resolve({ status: responseStatus, body: responseData })
      }
    })
  })
}

function mockPawnFind(routePawns = []) {
  return (query) => {
    if (query?.dueDate && query?.status?.$in) {
      // reminder query from refreshPawnStatuses
      return {
        populate: async () => [],
        then(resolve) { resolve([]) },
      }
    }
    // Route query
    return {
      populate: () => ({
        populate: () => ({
          sort: () => ({
            limit: async () => routePawns,
          }),
        }),
      }),
      select: () => ({
        lean: async () => routePawns,
      }),
    }
  }
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

test('RBAC: blocks unauthenticated requests with 401 across dashboard and report endpoints', async () => {
  for (const endpoint of ['/dashboard', '/business-overview', '/reports/sales', '/reports/purchases']) {
    const res = await callRoute(endpoint, {}, null)
    assert.equal(res.status, 401, `${endpoint} should return 401 unauthenticated`)
  }
})

test('RBAC: restricts /business-overview, /reports/sales, and /reports/purchases to OWNER and MANAGER', async () => {
  const stockToken = createToken('STOCK')
  const cashierToken = createToken('CASHIER')

  for (const role of ['STOCK', 'CASHIER']) {
    const token = role === 'STOCK' ? stockToken : cashierToken
    User.findById = () => ({
      select: () => Promise.resolve({ _id: testUserId, name: `Test ${role}`, role, active: true }),
    })

    const overviewRes = await callRoute('/business-overview', {}, token)
    assert.equal(overviewRes.status, 403, `/business-overview must return 403 for ${role}`)

    const salesRes = await callRoute('/reports/sales', {}, token)
    assert.equal(salesRes.status, 403, `/reports/sales must return 403 for ${role}`)

    const purchasesRes = await callRoute('/reports/purchases', {}, token)
    assert.equal(purchasesRes.status, 403, `/reports/purchases must return 403 for ${role}`)
  }

  // Dashboard permits all authenticated staff roles
  Pawn.updateMany = async () => ({ modifiedCount: 0 })
  Trade.aggregate = async () => []
  Pawn.aggregate = async () => []
  InventoryItem.countDocuments = async () => 0
  Pawn.countDocuments = async () => 0
  Customer.estimatedDocumentCount = async () => 0
  Pawn.estimatedDocumentCount = async () => 0
  Pawn.find = mockPawnFind([])
  Trade.find = () => ({ populate: () => ({ populate: () => ({ sort: () => ({ limit: async () => [] }) }) }) })
  InventoryItem.aggregate = async () => []

  User.findById = () => ({
    select: () => Promise.resolve({ _id: testUserId, name: 'Test Cashier', role: 'CASHIER', active: true }),
  })
  const cashierDashboard = await callRoute('/dashboard', {}, cashierToken)
  assert.equal(cashierDashboard.status, 200, '/dashboard should permit CASHIER')
})

test('GET /dashboard: aggregates sales, pawn conversions, stock counts, and performance metrics', async () => {
  const origPawnUpdateMany = Pawn.updateMany
  const origTradeAggregate = Trade.aggregate
  const origPawnAggregate = Pawn.aggregate
  const origInventoryCount = InventoryItem.countDocuments
  const origPawnCount = Pawn.countDocuments
  const origCustomerCount = Customer.estimatedDocumentCount
  const origPawnEstCount = Pawn.estimatedDocumentCount
  const origPawnFind = Pawn.find
  const origTradeFind = Trade.find
  const origInventoryAggregate = InventoryItem.aggregate

  Pawn.updateMany = async () => ({ modifiedCount: 0 })
  InventoryItem.countDocuments = async (query) => {
    if (query?.category === 'PHONE') return 42
    return 5 // low stock
  }
  Pawn.countDocuments = async () => 3 // overdue
  Customer.estimatedDocumentCount = async () => 150
  Pawn.estimatedDocumentCount = async () => 80

  Trade.aggregate = async (pipeline) => {
    const match = pipeline[0]?.$match || {}
    if (match.type === 'SELL' && match.status === 'COMPLETED') {
      return [{ _id: null, total: 2500 }]
    }
    if (match.type === 'BUY' && match.status === 'COMPLETED') {
      return [{ _id: null, total: 1100 }]
    }
    return []
  }

  Pawn.aggregate = async () => {
    return [{ _id: null, total: 4500 }]
  }

  Pawn.find = mockPawnFind([
    {
      _id: 'pawn-1',
      pawnNo: 'PW-001',
      principal: 500,
      currency: 'USD',
      status: 'ACTIVE',
      dueDate: new Date(Date.now() + 86400000),
      itemSnapshot: { name: 'iPhone 14' },
    },
  ])

  Trade.find = () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          limit: async () => [
            {
              _id: 'trade-1',
              tradeNo: 'TR-001',
              type: 'SELL',
              total: 800,
              currency: 'USD',
              status: 'COMPLETED',
            },
          ],
        }),
      }),
    }),
  })

  InventoryItem.aggregate = async () => [
    { _id: 'PHONE', count: 20, value: 8000 },
    { _id: 'ACCESSORY', count: 50, value: 500 },
  ]

  try {
    const res = await callRoute('/dashboard')
    assert.equal(res.status, 200)
    assert.equal(res.body.metrics.salesToday, 2500)
    assert.equal(res.body.metrics.purchasesToday, 1100)
    assert.equal(res.body.metrics.activePawnValue, 4500)
    assert.equal(res.body.metrics.phonesInStock, 42)
    assert.equal(res.body.metrics.overdueContracts, 3)
    assert.equal(res.body.metrics.lowStock, 5)
    assert.equal(res.body.metrics.customerCount, 150)
    assert.equal(res.body.recentPawns.length, 1)
    assert.equal(res.body.recentTrades.length, 1)
    assert.equal(res.body.inventoryMix.length, 2)
  } finally {
    Pawn.updateMany = origPawnUpdateMany
    Trade.aggregate = origTradeAggregate
    Pawn.aggregate = origPawnAggregate
    InventoryItem.countDocuments = origInventoryCount
    Pawn.countDocuments = origPawnCount
    Customer.estimatedDocumentCount = origCustomerCount
    Pawn.estimatedDocumentCount = origPawnEstCount
    Pawn.find = origPawnFind
    Trade.find = origTradeFind
    InventoryItem.aggregate = origInventoryAggregate
  }
})

test('GET /business-overview: calculates revenue, COGS, gross profit, and preserves dual currency isolation', async () => {
  const origPawnUpdateMany = Pawn.updateMany
  const origLoanUpdateMany = Loan.updateMany
  const origTradeAggregate = Trade.aggregate
  const origTradeFind = Trade.find
  const origPawnFind = Pawn.find
  const origLoanFind = Loan.find
  const origInventoryFind = InventoryItem.find
  const origActivityFind = ActivityLog.find

  Pawn.updateMany = async () => ({ modifiedCount: 0 })
  Loan.updateMany = async () => ({ modifiedCount: 0 })

  Trade.aggregate = async (pipeline) => {
    const groupStage = pipeline.find((stage) => stage.$group)
    if (groupStage && groupStage.$group._id === null) {
      return [{
        _id: null,
        salesRevenue: 5000,
        purchases: 3000,
        cogs: 3500,
      }]
    }
    return [
      { _id: '2026-09-01', sales: 2000, purchases: 1000, cogs: 1400 },
      { _id: '2026-09-02', sales: 3000, purchases: 2000, cogs: 2100 },
    ]
  }

  Trade.find = () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [
              { _id: 'tr-1', tradeNo: 'TR-1', type: 'SELL', total: 500, status: 'COMPLETED' },
            ],
          }),
        }),
      }),
    }),
  })

  Pawn.find = mockPawnFind([
    { _id: 'p-1', status: 'ACTIVE', currency: 'USD', principal: 1000, remainingPrincipal: 800 },
    { _id: 'p-2', status: 'ACTIVE', currency: 'KHR', principal: 4100000, remainingPrincipal: 4100000 },
  ])

  Loan.find = () => ({
    select: () => ({
      lean: async () => [
        { _id: 'l-1', status: 'ACTIVE', currency: 'USD', remainingBalance: 600 },
        { _id: 'l-2', status: 'ACTIVE', currency: 'KHR', remainingBalance: 2050000 },
      ],
    }),
  })

  InventoryItem.find = () => ({
    select: () => ({
      lean: async () => [
        { sku: 'P1', name: 'iPhone 13', category: 'PHONE', quantity: 2, reorderLevel: 1, buyPrice: 400, sellPrice: 600 },
        { sku: 'A1', name: 'USB-C Cable', category: 'ACCESSORY', quantity: 1, reorderLevel: 5, buyPrice: 2, sellPrice: 10 },
      ],
    }),
  })

  ActivityLog.find = () => ({
    populate: () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => [],
        }),
      }),
    }),
  })

  try {
    const res = await callRoute('/business-overview', { period: 'this_month' })
    assert.equal(res.status, 200)
    assert.equal(res.body.period.key, 'this_month')
    assert.equal(res.body.financial.salesRevenue, 5000)
    assert.equal(res.body.financial.purchases, 3000)
    assert.equal(res.body.financial.cogs, 3500)
    assert.equal(res.body.financial.grossProfit, 1500)

    assert.equal(res.body.pawn.outstandingPrincipal.USD, 800)
    assert.equal(res.body.pawn.outstandingPrincipal.KHR, 4100000)

    assert.equal(res.body.loans.outstandingBalance.USD, 600)
    assert.equal(res.body.loans.outstandingBalance.KHR, 2050000)

    assert.equal(res.body.inventory.productCount, 2)
    assert.equal(res.body.inventory.inStockCount, 3)
    assert.equal(res.body.inventory.phoneCount, 2)
    assert.equal(res.body.inventory.accessoryCount, 1)
    assert.equal(res.body.inventory.costValue, 802)
    assert.equal(res.body.inventory.retailValue, 1210)
    assert.equal(res.body.inventory.lowStockCount, 1)
  } finally {
    Pawn.updateMany = origPawnUpdateMany
    Loan.updateMany = origLoanUpdateMany
    Trade.aggregate = origTradeAggregate
    Trade.find = origTradeFind
    Pawn.find = origPawnFind
    Loan.find = origLoanFind
    InventoryItem.find = origInventoryFind
    ActivityLog.find = origActivityFind
  }
})

test('GET /reports/sales: applies status accounting signs, filters payment methods, and aggregates top products', async () => {
  const origTradeAggregate = Trade.aggregate
  const origTradeFind = Trade.find
  const origUserFind = User.find

  User.find = () => ({
    select: () => ({
      sort: () => ({
        lean: async () => [{ _id: testUserId, name: 'Test Staff', email: 'staff@test.com', role: 'CASHIER' }],
      }),
    }),
  })

  Trade.aggregate = async (pipeline) => {
    const groupStage = pipeline.find((stage) => stage.$group)
    if (groupStage && groupStage.$group._id === null) {
      return [{
        _id: null,
        salesRevenue: 4000,
        cogs: 2600,
        itemsSold: 5,
        transactions: 3,
      }]
    }
    if (groupStage && groupStage.$group._id === '$paymentMethod') {
      return [
        { _id: 'CASH', amount: 2500, transactions: 2 },
        { _id: 'KHQR', amount: 1500, transactions: 1 },
      ]
    }
    if (groupStage && groupStage.$group._id === '$name') {
      return [
        { _id: 'iPhone 13 128GB', quantity: 3, revenue: 2400, cogs: 1800, grossProfit: 600 },
        { _id: 'Samsung Galaxy S22', quantity: 2, revenue: 1600, cogs: 800, grossProfit: 800 },
      ]
    }
    return []
  }

  Trade.find = () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: 'sale-1',
                tradeNo: 'INV-1001',
                type: 'SELL',
                total: 800,
                subtotal: 800,
                discount: 0,
                paymentMethod: 'CASH',
                status: 'COMPLETED',
                items: [{ name: 'iPhone 13 128GB', quantity: 1, costPrice: 600, unitPrice: 800 }],
                createdAt: new Date(),
              },
            ],
          }),
        }),
      }),
    }),
  })

  try {
    const res = await callRoute('/reports/sales', { period: 'this_month', status: 'COMPLETED', paymentMethod: 'ALL' })
    assert.equal(res.status, 200)
    assert.equal(res.body.summary.salesRevenue, 4000)
    assert.equal(res.body.summary.cogs, 2600)
    assert.equal(res.body.summary.grossProfit, 1400)
    assert.equal(res.body.summary.itemsSold, 5)
    assert.equal(res.body.summary.transactions, 3)
    assert.equal(res.body.summary.averageSale, 1333.33)

    assert.equal(res.body.products.length, 2)
    assert.equal(res.body.products[0].name, 'iPhone 13 128GB')
    assert.equal(res.body.products[0].grossProfit, 600)

    assert.equal(res.body.payments.length, 2)
    const paymentSum = res.body.payments.reduce((sum, p) => sum + p.amount, 0)
    assert.equal(paymentSum, 4000, 'Sum of payments must equal total sales revenue')

    assert.equal(res.body.transactions.length, 1)
    assert.equal(res.body.transactions[0].reportTotal, 800)
    assert.equal(res.body.transactions[0].reportCost, 600)
    assert.equal(res.body.transactions[0].reportGrossProfit, 200)
  } finally {
    Trade.aggregate = origTradeAggregate
    Trade.find = origTradeFind
    User.find = origUserFind
  }
})

test('GET /reports/sales: rejects invalid payment method and invalid status with 400', async () => {
  const badMethodRes = await callRoute('/reports/sales', { paymentMethod: 'BITCOIN' })
  assert.equal(badMethodRes.status, 400)
  assert.match(badMethodRes.body.message, /valid payment method/i)

  const badStatusRes = await callRoute('/reports/sales', { status: 'PENDING' })
  assert.equal(badStatusRes.status, 400)
  assert.match(badStatusRes.body.message, /valid sale status/i)
})

test('GET /reports/purchases: aggregates seller sources, payment statuses, and costs', async () => {
  const origTradeAggregate = Trade.aggregate
  const origTradeFind = Trade.find
  const origUserFind = User.find

  User.find = () => ({
    select: () => ({
      sort: () => ({
        lean: async () => [],
      }),
    }),
  })

  Trade.aggregate = async (pipeline) => {
    const groupStage = pipeline.find((stage) => stage.$group)
    if (groupStage && groupStage.$group._id === null) {
      return [{
        _id: null,
        totalPurchases: 6000,
        amountPaid: 4500,
        outstandingBalance: 1500,
        itemsPurchased: 12,
        transactions: 4,
      }]
    }
    if (groupStage && groupStage.$group._id === '$source') {
      return [
        { _id: 'SUPPLIER', amount: 4000, transactions: 2 },
        { _id: 'CUSTOMER', amount: 2000, transactions: 2 },
      ]
    }
    if (groupStage && groupStage.$group._id === '$paymentMethod') {
      return [
        { _id: 'BANK', amount: 3500, transactions: 2 },
        { _id: 'CASH', amount: 2500, transactions: 2 },
      ]
    }
    if (groupStage && groupStage.$group._id === '$name') {
      return [
        { _id: 'Screen Assembly OLED', quantity: 10, totalCost: 4000, transactions: 2 },
      ]
    }
    return []
  }

  Trade.find = () => ({
    populate: () => ({
      populate: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [
                {
                  _id: 'buy-1',
                  tradeNo: 'PO-2001',
                  type: 'BUY',
                  total: 3000,
                  amountPaid: 2000,
                  balance: 1000,
                  currency: 'USD',
                  paymentStatus: 'PARTIAL',
                  status: 'COMPLETED',
                  items: [{ name: 'Screen Assembly OLED', quantity: 5, unitPrice: 400 }],
                },
              ],
            }),
          }),
        }),
      }),
    }),
  })

  try {
    const res = await callRoute('/reports/purchases', {
      period: 'this_month',
      source: 'ALL',
      paymentStatus: 'ALL',
      paymentMethod: 'ALL',
      status: 'COMPLETED',
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.summary.totalPurchases, 6000)
    assert.equal(res.body.summary.amountPaid, 4500)
    assert.equal(res.body.summary.outstandingBalance, 1500)
    assert.equal(res.body.summary.itemsPurchased, 12)
    assert.equal(res.body.summary.transactions, 4)

    assert.equal(res.body.sources.length, 2)
    const sourceSum = res.body.sources.reduce((sum, s) => sum + s.amount, 0)
    assert.equal(sourceSum, 6000, 'Sum of sources must equal total purchases')

    assert.equal(res.body.payments.length, 2)
    const paymentSum = res.body.payments.reduce((sum, p) => sum + p.amount, 0)
    assert.equal(paymentSum, 6000, 'Sum of payments must equal total purchases')
  } finally {
    Trade.aggregate = origTradeAggregate
    Trade.find = origTradeFind
    User.find = origUserFind
  }
})

test('GET /reports/purchases: rejects invalid source and invalid payment status with 400', async () => {
  const badSourceRes = await callRoute('/reports/purchases', { source: 'STRANGER' })
  assert.equal(badSourceRes.status, 400)
  assert.match(badSourceRes.body.message, /valid purchase source/i)

  const badPaymentStatusRes = await callRoute('/reports/purchases', { paymentStatus: 'OVERPAID' })
  assert.equal(badPaymentStatusRes.status, 400)
  assert.match(badPaymentStatusRes.body.message, /valid payment status/i)
})

test('GET /reports/sales and purchases: all_time includes full history and returns compact monthly chart points', async () => {
  const origTradeAggregate = Trade.aggregate
  const origTradeFind = Trade.find
  const origUserFind = User.find
  const capturedPipelines = []

  Trade.aggregate = async (pipeline) => {
    capturedPipelines.push(pipeline)
    const groupStage = pipeline.find((stage) => stage.$group)
    if (groupStage?.$group?._id === '$bucket') {
      return [{ _id: '2024-01', sales: 100, cogs: 60, total: 80, paid: 50, balance: 30 }]
    }
    return []
  }
  Trade.find = () => {
    const query = {
      populate() { return query },
      sort() { return query },
      limit() { return query },
      lean: async () => [],
    }
    return query
  }
  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })

  try {
    for (const path of ['/reports/sales', '/reports/purchases']) {
      capturedPipelines.length = 0
      const res = await callRoute(path, { period: 'all_time' })
      assert.equal(res.status, 200)
      assert.equal(res.body.period.key, 'all_time')
      assert.equal(res.body.period.label, 'All Time')
      assert.equal(res.body.period.granularity, 'month')
      assert.equal(res.body.period.from, new Date(0).toISOString())
      assert.equal(res.body.chart.length, 1, 'All Time should not create empty chart buckets from 1970')
      assert.equal(res.body.chart[0].key, '2024-01')
      assert.equal(res.body.chart[0].label, 'Jan 2024')

      const firstMatch = capturedPipelines[0][0].$match
      const dateRange = path.endsWith('/sales') ? firstMatch.createdAt : firstMatch.$or[0].purchaseDate
      assert.equal(dateRange.$gte.getTime(), 0)
      assert.ok(dateRange.$lt instanceof Date)
    }
  } finally {
    Trade.aggregate = origTradeAggregate
    Trade.find = origTradeFind
    User.find = origUserFind
  }
})

test('GET /reports/sales & /reports/purchases: rejects invalid custom date ranges and verifies pipeline construction', async () => {
  // 1. Invalid custom date format in sales
  const badDateSales = await callRoute('/reports/sales', { period: 'custom', from: 'invalid-date', to: '2026-03-10' })
  assert.equal(badDateSales.status, 400)
  assert.match(badDateSales.body.message, /Choose a valid From and To date/i)

  // 2. Inverted dates in sales
  const invertedSales = await callRoute('/reports/sales', { period: 'custom', from: '2026-03-25', to: '2026-03-10' })
  assert.equal(invertedSales.status, 400)
  assert.match(invertedSales.body.message, /From date must be before or equal to To date/i)

  // 3. Inverted dates in purchases
  const invertedPurchases = await callRoute('/reports/purchases', { period: 'custom', from: '2026-03-25', to: '2026-03-10' })
  assert.equal(invertedPurchases.status, 400)
  assert.match(invertedPurchases.body.message, /From date must be before or equal to To date/i)

  // 4. Inspect pipeline stages passed to Trade.aggregate for sales
  const origTradeAggregate = Trade.aggregate
  const origTradeFind = Trade.find
  const origUserFind = User.find
  const capturedPipelines = []

  Trade.aggregate = async (pipeline) => {
    capturedPipelines.push(pipeline)
    return []
  }
  Trade.find = () => ({
    populate: () => ({ populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) }),
  })
  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) })

  try {
    const res = await callRoute('/reports/sales', {
      period: 'today',
      paymentMethod: 'KHQR',
      status: 'RETURNED',
    })
    assert.equal(res.status, 200)
    assert.ok(capturedPipelines.length >= 3, 'Sales report should execute summary, chart, payments, and products aggregation pipelines')

    // Inspect summary pipeline: $match stage must filter by SELL, RETURNED, and paymentMethod=KHQR
    const summaryMatch = capturedPipelines[0][0]?.$match
    assert.equal(summaryMatch.type, 'SELL')
    assert.equal(summaryMatch.status, 'RETURNED')
    assert.equal(summaryMatch.paymentMethod, 'KHQR')
    assert.ok(summaryMatch.createdAt?.$gte instanceof Date)
    assert.ok(summaryMatch.createdAt?.$lt instanceof Date)

    // The mocked aggregation returned no results, so summary values default to zero.
    // This assertion does not validate MongoDB's returned-sale sign calculation.
    assert.equal(res.body.summary.salesRevenue, 0)
  } finally {
    Trade.aggregate = origTradeAggregate
    Trade.find = origTradeFind
    User.find = origUserFind
  }
})
