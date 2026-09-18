import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { User, InventoryItem, Pawn, Customer, Supplier } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { Loan } from './loanModels.js'
import { ServiceOffering } from './serviceModels.js'
import searchRouter from './searchRoutes.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-search-tests'
const testUserId = new mongoose.Types.ObjectId()
const testSessionId = 'search-test-session-1'

const testToken = jwt.sign(
  { sub: testUserId.toString(), sid: testSessionId },
  process.env.JWT_SECRET,
  { expiresIn: 3600 },
)

let currentUserRole = 'OWNER'

async function callSearchRoute(queryParam, { token = testToken } = {}) {
  return new Promise((resolve, reject) => {
    const query = {}
    if (queryParam !== undefined) {
      query.q = queryParam
    }

    const req = {
      method: 'GET',
      url: `/?${new URLSearchParams(query).toString()}`,
      params: {},
      query,
      body: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
      get(header) {
        return this.headers[header.toLowerCase()]
      },
      ip: '127.0.0.1',
    }

    let responseData = null
    let responseStatus = 200
    const res = {
      set() {},
      status(code) {
        responseStatus = code
        return this
      },
      json(data) {
        responseData = data
        setTimeout(() => resolve({ status: responseStatus, body: data }), 0)
        return this
      },
    }

    searchRouter.handle(req, res, (err) => {
      if (err) reject(err)
      else resolve({ status: responseStatus, body: responseData })
    })
  })
}

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById

const origInventoryFind = InventoryItem.find
const origPawnFind = Pawn.find
const origLoanFind = Loan.find
const origCustomerFind = Customer.find
const origServiceOfferingFind = ServiceOffering.find
const origSupplierFind = Supplier.find

test.beforeEach(() => {
  currentUserRole = 'OWNER'
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
      name: 'Test User',
      email: 'user@phoneflow.test',
      role: currentUserRole,
      active: true,
    }),
  })
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById

  InventoryItem.find = origInventoryFind
  Pawn.find = origPawnFind
  Loan.find = origLoanFind
  Customer.find = origCustomerFind
  ServiceOffering.find = origServiceOfferingFind
  Supplier.find = origSupplierFind
})

test('Search endpoint requires authentication', async () => {
  const result = await callSearchRoute('iphone', { token: null })
  assert.equal(result.status, 401)
  assert.match(result.body.message, /authentication required/i)
})

test('Search endpoint returns empty payload when query is empty or whitespace', async () => {
  const result = await callSearchRoute('   ')
  assert.equal(result.status, 200)
  assert.equal(result.body.total, 0)
  assert.deepEqual(result.body.results.inventory, [])
  assert.deepEqual(result.body.results.pawns, [])
  assert.deepEqual(result.body.results.loans, [])
  assert.deepEqual(result.body.results.customers, [])
  assert.deepEqual(result.body.results.services, [])
  assert.deepEqual(result.body.results.suppliers, [])
})

test('Role boundaries: STOCK role can only search inventory and suppliers', async () => {
  currentUserRole = 'STOCK'

  let inventorySearched = false
  let supplierSearched = false
  let pawnSearched = false
  let loanSearched = false
  let customerSearched = false

  InventoryItem.find = () => {
    inventorySearched = true
    return {
      select: () => ({
        limit: () => ({
          lean: async () => [{ _id: 'inv-1', name: 'iPhone 15' }],
        }),
      }),
    }
  }

  Supplier.find = () => {
    supplierSearched = true
    return {
      select: () => ({
        limit: () => ({
          lean: async () => [{ _id: 'sup-1', name: 'Apple Distributor' }],
        }),
      }),
    }
  }

  Pawn.find = () => {
    pawnSearched = true
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }

  Loan.find = () => {
    loanSearched = true
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }

  Customer.find = () => {
    customerSearched = true
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }

  const result = await callSearchRoute('Apple')
  assert.equal(result.status, 200)
  assert.equal(inventorySearched, true)
  assert.equal(supplierSearched, true)
  assert.equal(pawnSearched, false, 'STOCK must not search pawns')
  assert.equal(loanSearched, false, 'STOCK must not search loans')
  assert.equal(customerSearched, false, 'STOCK must not search customers')
  assert.equal(result.body.results.inventory.length, 1)
  assert.equal(result.body.results.suppliers.length, 1)
  assert.equal(result.body.results.pawns.length, 0)
  assert.equal(result.body.results.loans.length, 0)
  assert.equal(result.body.results.customers.length, 0)
})

test('Role boundaries: CASHIER can search inventory, pawns, loans, customers, services but NOT suppliers', async () => {
  currentUserRole = 'CASHIER'

  let supplierSearched = false
  let loanSelectedFields = ''

  InventoryItem.find = () => ({
    select: () => ({
      limit: () => ({
        lean: async () => [{ _id: 'inv-1', name: 'Samsung Galaxy' }],
      }),
    }),
  })

  Pawn.find = () => ({
    select: () => ({
      limit: () => ({
        lean: async () => [{ _id: 'pwn-1', pawnNo: 'PW-2026-001' }],
      }),
    }),
  })

  Loan.find = () => ({
    select: (fields) => {
      loanSelectedFields = fields
      return {
        limit: () => ({
          lean: async () => [{ _id: 'loan-1', loanNo: 'LN-2026-001' }],
        }),
      }
    },
  })

  Customer.find = () => ({
    select: () => ({
      limit: () => ({
        lean: async () => [{ _id: 'cust-1', name: 'Sokha Chan' }],
      }),
    }),
  })

  ServiceOffering.find = () => ({
    select: () => ({
      limit: () => ({
        lean: async () => [{ _id: 'srv-1', code: 'SVC-001', name: 'Galaxy setup' }],
      }),
    }),
  })

  Supplier.find = () => {
    supplierSearched = true
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }

  const result = await callSearchRoute('Galaxy')
  assert.equal(result.status, 200)
  assert.equal(supplierSearched, false, 'CASHIER must not search suppliers')
  assert.equal(result.body.results.suppliers.length, 0)
  assert.equal(result.body.results.inventory.length, 1)
  assert.equal(result.body.results.pawns.length, 1)
  assert.equal(result.body.results.loans.length, 1)
  assert.equal(result.body.results.customers.length, 1)
  assert.equal(result.body.results.services.length, 1)
  // Ensure sensitive borrower fields are omitted for Cashier
  assert.equal(loanSelectedFields.includes('nationalIdNumber'), false)
  assert.equal(loanSelectedFields.includes('address'), false)
})

test('Safe regex escaping: special regex characters do not crash the search query', async () => {
  let capturedQuery = null

  InventoryItem.find = (filter) => {
    capturedQuery = filter
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }
  Pawn.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
  Loan.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
  Customer.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
  ServiceOffering.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
  Supplier.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })

  const dangerousQuery = '[test]*+(?)^$|'
  const result = await callSearchRoute(dangerousQuery)
  assert.equal(result.status, 200)
  assert.equal(result.body.total, 0)
  assert.ok(capturedQuery)
})

test('Matching criteria: checks all specified fields for inventory, pawns, loans, and customers', async () => {
  let inventoryFilter = null
  let pawnFilter = null
  let loanFilter = null
  let customerFilter = null

  InventoryItem.find = (f) => {
    inventoryFilter = f
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }
  Pawn.find = (f) => {
    pawnFilter = f
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }
  Loan.find = (f) => {
    loanFilter = f
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }
  Customer.find = (f) => {
    customerFilter = f
    return { select: () => ({ limit: () => ({ lean: async () => [] }) }) }
  }
  ServiceOffering.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })
  Supplier.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) })

  await callSearchRoute('352000000000000')

  // Inventory fields: product name, sku, barcode, imei1, imei2, serialNumber
  const inventoryKeys = inventoryFilter.$or.flatMap(Object.keys)
  assert.ok(inventoryKeys.includes('name'))
  assert.ok(inventoryKeys.includes('sku'))
  assert.ok(inventoryKeys.includes('barcode'))
  assert.ok(inventoryKeys.includes('imei1'))
  assert.ok(inventoryKeys.includes('serialNumber'))

  // Pawn customer is a reference, so matched customer IDs are used instead of nonexistent nested fields.
  const pawnKeys = pawnFilter.$or.flatMap(Object.keys)
  assert.ok(pawnKeys.includes('pawnNo'))
  assert.ok(pawnKeys.includes('customer'))
  assert.ok(pawnKeys.includes('itemSnapshot.name'))

  // Loan fields: loanNo, borrower.name, borrower.phone, reason
  const loanKeys = loanFilter.$or.flatMap(Object.keys)
  assert.ok(loanKeys.includes('loanNo'))
  assert.ok(loanKeys.includes('borrower.name'))
  assert.ok(loanKeys.includes('borrower.phone'))

  // Customer fields: name, phone
  const customerKeys = customerFilter.$or.flatMap(Object.keys)
  assert.ok(customerKeys.includes('name'))
  assert.ok(customerKeys.includes('phone'))
})

test('Search returns display-ready records and matches pawn customers by reference', async () => {
  const customerId = new mongoose.Types.ObjectId()
  let pawnFilter
  const rowsQuery = (rows) => ({ select: () => ({ limit: () => ({ lean: async () => rows }) }) })
  InventoryItem.find = () => rowsQuery([{
    _id: 'inv-1', name: 'iPhone 14', sku: 'PF-14', imei1: '12345', sellPrice: 250,
    pricingCurrency: 'USD', costPrice: 100,
  }])
  Customer.find = () => rowsQuery([{
    _id: customerId, name: 'Dara', phone: '012345678', nationalIdNumber: 'private-id', active: true,
  }])
  Pawn.find = (filter) => {
    pawnFilter = filter
    return rowsQuery([{
      _id: 'pawn-1', pawnNo: 'PW-1', customer: customerId,
      itemSnapshot: { name: 'iPhone 14' }, remainingPrincipal: 120, currency: 'USD', status: 'ACTIVE',
    }])
  }
  Loan.find = () => rowsQuery([{
    _id: 'loan-1', loanNo: 'LN-1', borrower: { name: 'Dara', phone: '012345678' },
    remainingBalance: 50, currency: 'USD', status: 'ACTIVE',
  }])
  ServiceOffering.find = () => rowsQuery([{
    _id: 'service-1', code: 'SV-1', name: 'Phone setup', active: true,
  }])
  Supplier.find = () => rowsQuery([])

  const result = await callSearchRoute('Dara')
  assert.equal(result.body.total, 5)
  assert.equal(result.body.results.inventory[0].productName, 'iPhone 14')
  assert.equal(result.body.results.inventory[0].salePrice, 250)
  assert.equal(result.body.results.inventory[0].costPrice, undefined)
  assert.deepEqual(pawnFilter.$or[1].customer.$in, [customerId])
  assert.equal(result.body.results.pawns[0].customerName, 'Dara')
  assert.equal(result.body.results.pawns[0].collateral, 'iPhone 14')
  assert.equal(result.body.results.loans[0].customerName, 'Dara')
  assert.equal(result.body.results.services[0].code, 'SV-1')
})
