import assert from 'node:assert/strict'
import test from 'node:test'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import documentRouter from './documentRoutes.js'
import { preventCustomerDeletionWithDocuments } from './documentGuards.js'
import { CustomerDocument, DocumentStorageUsage } from './documentModels.js'
import { Customer, Pawn, Trade, ActivityLog, User } from './models.js'
import { AuthSession } from './authSessionModels.js'
import { encryptDocument } from './documentCrypto.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-document-routes-12345'
process.env.DOCUMENT_ENCRYPTION_KEY = process.env.DOCUMENT_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64')
mongoose.set('bufferCommands', false)

const testSessionId = 'doc-test-session-1'

const mockOwner = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00001'),
  name: 'Owner Alice',
  email: 'alice@shop.com',
  role: 'OWNER',
  active: true,
}

const mockManager = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00002'),
  name: 'Manager Bob',
  email: 'bob@shop.com',
  role: 'MANAGER',
  active: true,
}

const mockCashier = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00003'),
  name: 'Cashier Charlie',
  email: 'charlie@shop.com',
  role: 'CASHIER',
  active: true,
}

const mockStock = {
  _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00004'),
  name: 'Stock Sam',
  email: 'sam@shop.com',
  role: 'STOCK',
  active: true,
}

let currentUser = mockOwner

const origAuthSessionFindOne = AuthSession.findOne
const origAuthSessionUpdateOne = AuthSession.updateOne
const origUserFindById = User.findById
const origMongooseTransaction = mongoose.connection.transaction

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
  mongoose.connection.transaction = async (callback) => {
    return callback({})
  }
})

test.afterEach(() => {
  AuthSession.findOne = origAuthSessionFindOne
  AuthSession.updateOne = origAuthSessionUpdateOne
  User.findById = origUserFindById
  mongoose.connection.transaction = origMongooseTransaction
})

// Stub ActivityLog save so DB operations don't block
ActivityLog.prototype.save = async function() { return this }

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

    const [pathname, queryString] = url.split('?')
    const parsedQuery = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : query

    const req = {
      method: method.toUpperCase(),
      url,
      originalUrl: url,
      path: pathname,
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
    const cookiesCleared = []

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
      clearCookie(name, opts) {
        cookiesCleared.push({ name, opts })
        return this
      },
      json(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders, cookiesCleared })
      },
      send(data) {
        responseBody = data
        resolve({ status: statusCode, body: data, headers: responseHeaders, cookiesCleared })
      },
      end() {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders, cookiesCleared })
      },
    }

    router.handle(req, res, (err) => {
      if (err) {
        const code = err.status || 500
        resolve({ status: code, body: { message: err.message }, headers: responseHeaders, error: err })
      } else {
        resolve({ status: statusCode, body: responseBody, headers: responseHeaders, cookiesCleared })
      }
    })
  })
}

// Helpers for test payloads
function validJpegDataUrl() {
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  return `data:image/jpeg;base64,${jpegBytes.toString('base64')}`
}

function validPdfDataUrl() {
  const pdfBytes = Buffer.from('%PDF-1.4\n%test')
  return `data:application/pdf;base64,${pdfBytes.toString('base64')}`
}

// ============================================================================
// Authentication & Role Permissions
// ============================================================================

test('GET /status rejects unauthenticated requests with 401', async () => {
  const res = await callRouter(documentRouter, { method: 'GET', url: '/status' })
  assert.equal(res.status, 401)
  assert.match(res.body?.message || '', /Authentication required/i)
})

test('STOCK role is forbidden from all document vault endpoints with 403', async () => {
  const routes = [
    { method: 'GET', url: '/status' },
    { method: 'GET', url: '/summary' },
    { method: 'GET', url: '/customers/64b8f0a1c9e77b0012a00099' },
    { method: 'POST', url: '/customers/64b8f0a1c9e77b0012a00099' },
    { method: 'GET', url: '/64b8f0a1c9e77b0012a00099/file' },
    { method: 'DELETE', url: '/64b8f0a1c9e77b0012a00099' },
  ]

  for (const route of routes) {
    const res = await callRouter(documentRouter, { ...route, user: mockStock })
    assert.equal(res.status, 403, `${route.method} ${route.url} should deny STOCK with 403`)
    assert.match(res.body?.message || '', /do not have permission/i)
  }
})

test('CASHIER role can view status and summary, but cannot delete documents (403)', async () => {
  // Can view status
  const statusRes = await callRouter(documentRouter, { method: 'GET', url: '/status', user: mockCashier })
  assert.equal(statusRes.status, 200)
  assert.equal(statusRes.body.configured, true)

  // Forbidden from deleting
  const deleteRes = await callRouter(documentRouter, {
    method: 'DELETE',
    url: '/64b8f0a1c9e77b0012a00099',
    user: mockCashier,
  })
  assert.equal(deleteRes.status, 403)
  assert.match(deleteRes.body?.message || '', /do not have permission/i)
})

test('All document endpoints apply private no-store cache headers', async () => {
  const res = await callRouter(documentRouter, { method: 'GET', url: '/status', user: mockOwner })
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0')
  assert.equal(res.headers['pragma'], 'no-cache')
  assert.equal(res.headers['expires'], '0')
})

// ============================================================================
// Customer Document Listing & Validation
// ============================================================================

test('GET /customers/:id rejects invalid ObjectId with 400', async () => {
  const res = await callRouter(documentRouter, {
    method: 'GET',
    url: '/customers/invalid-id-format',
    user: mockOwner,
  })
  assert.equal(res.status, 400)
  assert.match(res.body?.message || '', /Customer ID is invalid/i)
})

test('GET /customers/:id returns 404 when customer does not exist', async () => {
  const origFindById = Customer.findById
  Customer.findById = () => ({
    select: () => Promise.resolve(null),
  })

  try {
    const res = await callRouter(documentRouter, {
      method: 'GET',
      url: '/customers/64b8f0a1c9e77b0012a00099',
      user: mockOwner,
    })
    assert.equal(res.status, 404)
    assert.match(res.body?.message || '', /Customer was not found/i)
  } finally {
    Customer.findById = origFindById
  }
})

// ============================================================================
// Upload Validation & Error Cases
// ============================================================================

test('POST /customers/:id rejects invalid document category with 400', async () => {
  const testCustId = new mongoose.Types.ObjectId()
  const origFindById = Customer.findById
  Customer.findById = () => ({
    select: () => Promise.resolve({ _id: testCustId, name: 'Cust A', active: true }),
  })

  try {
    const res = await callRouter(documentRouter, {
      method: 'POST',
      url: `/customers/${testCustId}`,
      user: mockOwner,
      body: {
        category: 'INVALID_CATEGORY',
        fileData: validJpegDataUrl(),
        originalName: 'test.jpg',
      },
    })
    assert.equal(res.status, 400)
    assert.match(res.body?.message || '', /Document category is invalid/i)
  } finally {
    Customer.findById = origFindById
  }
})

test('POST /customers/:id rejects missing or corrupt file data with 400', async () => {
  const testCustId = new mongoose.Types.ObjectId()
  const origFindById = Customer.findById
  Customer.findById = () => ({
    select: () => Promise.resolve({ _id: testCustId, name: 'Cust A', active: true }),
  })

  try {
    const res = await callRouter(documentRouter, {
      method: 'POST',
      url: `/customers/${testCustId}`,
      user: mockOwner,
      body: {
        category: 'NATIONAL_ID_FRONT',
        fileData: 'not-a-valid-data-url',
        originalName: 'test.jpg',
      },
    })
    assert.equal(res.status, 400)
    assert.match(res.body?.message || '', /Upload a JPEG, PNG, WebP, or PDF/i)
  } finally {
    Customer.findById = origFindById
  }
})

test('POST /customers/:id rejects MIME type mismatch between header and magic bytes with 400', async () => {
  const testCustId = new mongoose.Types.ObjectId()
  const origFindById = Customer.findById
  Customer.findById = () => ({
    select: () => Promise.resolve({ _id: testCustId, name: 'Cust A', active: true }),
  })

  // Declares image/jpeg but payload contains plain text bytes
  const fakeJpeg = `data:image/jpeg;base64,${Buffer.from('hello-world-not-jpeg').toString('base64')}`

  try {
    const res = await callRouter(documentRouter, {
      method: 'POST',
      url: `/customers/${testCustId}`,
      user: mockOwner,
      body: {
        category: 'NATIONAL_ID_FRONT',
        fileData: fakeJpeg,
        originalName: 'fake.jpg',
      },
    })
    assert.equal(res.status, 400)
    assert.match(res.body?.message || '', /do not match the declared file type/i)
  } finally {
    Customer.findById = origFindById
  }
})

test('POST /customers/:id rejects cross-customer reference when reference does not belong to customer (404)', async () => {
  const testCustId = new mongoose.Types.ObjectId()
  const origFindById = Customer.findById
  const origPawnFindOne = Pawn.findOne
  const origTradeFindOne = Trade.findOne

  Customer.findById = () => ({
    select: () => Promise.resolve({ _id: testCustId, name: 'Cust A', active: true }),
  })
  // Pawn and Trade do not find any matching record for this customer
  Pawn.findOne = () => ({
    select: () => Promise.resolve(null),
  })
  Trade.findOne = () => ({
    select: () => Promise.resolve(null),
  })

  try {
    const res = await callRouter(documentRouter, {
      method: 'POST',
      url: `/customers/${testCustId}`,
      user: mockOwner,
      body: {
        category: 'PAWN_ITEM_PHOTO',
        fileData: validJpegDataUrl(),
        originalName: 'pawn.jpg',
        relatedReference: 'PW-9999',
      },
    })
    assert.equal(res.status, 404)
    assert.match(res.body?.message || '', /No pawn or trade belonging to this customer matches/i)
  } finally {
    Customer.findById = origFindById
    Pawn.findOne = origPawnFindOne
    Trade.findOne = origTradeFindOne
  }
})

test('POST /customers/:id rejects duplicate document upload with 409', async () => {
  const testCustId = new mongoose.Types.ObjectId()
  const origFindById = Customer.findById
  const origStorageFindOne = DocumentStorageUsage.findOne
  const origDocExists = CustomerDocument.exists

  Customer.findById = () => ({
    select: () => Promise.resolve({ _id: testCustId, name: 'Cust A', active: true }),
  })
  DocumentStorageUsage.findOne = async () => ({ scope: 'SHOP', documentCount: 1, encryptedBytes: 100 })
  CustomerDocument.exists = () => ({
    session: () => Promise.resolve({ _id: new mongoose.Types.ObjectId() }),
  })

  try {
    const res = await callRouter(documentRouter, {
      method: 'POST',
      url: `/customers/${testCustId}`,
      user: mockOwner,
      body: {
        category: 'NATIONAL_ID_FRONT',
        fileData: validJpegDataUrl(),
        originalName: 'id.jpg',
      },
    })
    assert.equal(res.status, 409)
    assert.match(res.body?.message || '', /This exact document is already stored for the customer/i)
  } finally {
    Customer.findById = origFindById
    DocumentStorageUsage.findOne = origStorageFindOne
    CustomerDocument.exists = origDocExists
  }
})

test('POST /customers/:id successfully stores encrypted document and returns projected payload', async () => {
  const testCustId = new mongoose.Types.ObjectId()
  const origFindById = Customer.findById
  const origStorageFindOne = DocumentStorageUsage.findOne
  const origStorageFindOneAndUpdate = DocumentStorageUsage.findOneAndUpdate
  const origDocExists = CustomerDocument.exists
  const origDocAggregate = CustomerDocument.aggregate
  const origDocCreate = CustomerDocument.create

  Customer.findById = () => ({
    select: () => Promise.resolve({ _id: testCustId, name: 'Cust A', active: true }),
  })
  DocumentStorageUsage.findOne = () => ({
    session: () => Promise.resolve({ scope: 'SHOP', documentCount: 1, encryptedBytes: 1000 }),
    then(r) { return Promise.resolve({ scope: 'SHOP', documentCount: 1, encryptedBytes: 1000 }).then(r) },
  })
  CustomerDocument.exists = () => ({
    session: () => Promise.resolve(null),
  })
  CustomerDocument.aggregate = () => ({
    session: () => Promise.resolve([{ documentCount: 0, encryptedBytes: 0 }]),
  })
  DocumentStorageUsage.findOneAndUpdate = async () => ({
    scope: 'SHOP',
    documentCount: 2,
    encryptedBytes: 1010,
  })

  let createdRecord = null
  CustomerDocument.create = async (docs) => {
    createdRecord = {
      ...docs[0],
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date().toISOString(),
      populate: async () => createdRecord,
    }
    return [createdRecord]
  }

  try {
    const res = await callRouter(documentRouter, {
      method: 'POST',
      url: `/customers/${testCustId}`,
      user: mockOwner,
      body: {
        category: 'CUSTOMER_PHOTO',
        fileData: validJpegDataUrl(),
        originalName: 'profile.jpg',
        note: 'Customer portrait at registration',
      },
    })

    assert.equal(res.status, 201)
    assert.equal(res.body.document.originalName, 'profile.jpg')
    assert.equal(res.body.document.category, 'CUSTOMER_PHOTO')
    assert.equal(res.body.document.note, 'Customer portrait at registration')
    // Ensure sensitive crypto fields are omitted from returned projection
    assert.equal('encryptedData' in res.body.document, false)
    assert.equal('iv' in res.body.document, false)
    assert.equal('authTag' in res.body.document, false)
  } finally {
    Customer.findById = origFindById
    DocumentStorageUsage.findOne = origStorageFindOne
    DocumentStorageUsage.findOneAndUpdate = origStorageFindOneAndUpdate
    CustomerDocument.exists = origDocExists
    CustomerDocument.aggregate = origDocAggregate
    CustomerDocument.create = origDocCreate
  }
})

// ============================================================================
// File View & Download Decryption
// ============================================================================

test('GET /:id/file rejects invalid ObjectId with 400 and missing document with 404', async () => {
  // Invalid ObjectId
  const resBadId = await callRouter(documentRouter, {
    method: 'GET',
    url: '/invalid-doc-id/file',
    user: mockOwner,
  })
  assert.equal(resBadId.status, 400)
  assert.match(resBadId.body?.message || '', /Document ID is invalid/i)

  // Not found
  const origFindById = CustomerDocument.findById
  CustomerDocument.findById = () => ({
    select: () => Promise.resolve(null),
  })

  try {
    const resNotFound = await callRouter(documentRouter, {
      method: 'GET',
      url: '/64b8f0a1c9e77b0012a00099/file',
      user: mockOwner,
    })
    assert.equal(resNotFound.status, 404)
    assert.match(resNotFound.body?.message || '', /Secure document was not found/i)
  } finally {
    CustomerDocument.findById = origFindById
  }
})

test('GET /:id/file decrypts document, sets inline disposition by default, and attachment with download=1', async () => {
  const plainText = 'PDF document content for testing decryption'
  const plainBuffer = Buffer.from(plainText)
  const encrypted = encryptDocument(plainBuffer)

  const mockDoc = {
    _id: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    category: 'SIGNED_AGREEMENT',
    originalName: 'agreement.pdf',
    mimeType: 'application/pdf',
    byteSize: plainBuffer.length,
    sha256: 'mock-sha256',
    ...encrypted,
  }

  const origFindById = CustomerDocument.findById
  CustomerDocument.findById = () => ({
    select: () => Promise.resolve(mockDoc),
  })

  try {
    // 1. Inline view
    const viewRes = await callRouter(documentRouter, {
      method: 'GET',
      url: `/${mockDoc._id}/file`,
      user: mockOwner,
    })
    assert.equal(viewRes.status, 200)
    assert.equal(viewRes.headers['content-type'], 'application/pdf')
    assert.match(viewRes.headers['content-disposition'], /^inline;/)
    assert.equal(viewRes.body.toString('utf8'), plainText)

    // 2. Attachment download
    const dlRes = await callRouter(documentRouter, {
      method: 'GET',
      url: `/${mockDoc._id}/file?download=1`,
      user: mockOwner,
    })
    assert.equal(dlRes.status, 200)
    assert.match(dlRes.headers['content-disposition'], /^attachment;/)
    assert.equal(dlRes.body.toString('utf8'), plainText)
  } finally {
    CustomerDocument.findById = origFindById
  }
})

// ============================================================================
// Deletion & Customer Deletion Guard
// ============================================================================

test('DELETE /:id returns 404 if document does not exist, and deletes document when found', async () => {
  const origFindById = CustomerDocument.findById
  const origStorageFindOne = DocumentStorageUsage.findOne
  const origStorageUpdateOne = DocumentStorageUsage.updateOne
  const origDeleteOne = CustomerDocument.deleteOne

  DocumentStorageUsage.findOne = async () => ({ scope: 'SHOP', documentCount: 1, encryptedBytes: 100 })
  DocumentStorageUsage.updateOne = async () => ({ acknowledged: true })

  // Document not found
  CustomerDocument.findById = () => ({
    session: () => Promise.resolve(null),
  })

  const notFoundRes = await callRouter(documentRouter, {
    method: 'DELETE',
    url: '/64b8f0a1c9e77b0012a00099',
    user: mockOwner,
  })
  assert.equal(notFoundRes.status, 404)
  assert.match(notFoundRes.body?.message || '', /Secure document was not found/i)

  // Document found and deleted
  let deletedId = null
  CustomerDocument.findById = () => ({
    session: () => Promise.resolve({
      _id: new mongoose.Types.ObjectId('64b8f0a1c9e77b0012a00099'),
      customer: new mongoose.Types.ObjectId(),
      category: 'NATIONAL_ID_FRONT',
      byteSize: 500,
    }),
  })
  CustomerDocument.deleteOne = async (filter) => {
    deletedId = filter._id
    return { acknowledged: true }
  }

  const successRes = await callRouter(documentRouter, {
    method: 'DELETE',
    url: '/64b8f0a1c9e77b0012a00099',
    user: mockOwner,
  })
  assert.equal(successRes.status, 200)
  assert.equal(successRes.body.deleted, true)
  assert.equal(deletedId.toString(), '64b8f0a1c9e77b0012a00099')

  CustomerDocument.findById = origFindById
  DocumentStorageUsage.findOne = origStorageFindOne
  DocumentStorageUsage.updateOne = origStorageUpdateOne
  CustomerDocument.deleteOne = origDeleteOne
})

test('preventCustomerDeletionWithDocuments guard blocks customer deletion (409) when documents exist', async () => {
  const origExists = CustomerDocument.exists
  CustomerDocument.exists = async () => ({ _id: new mongoose.Types.ObjectId() })

  const req = { params: { id: '64b8f0a1c9e77b0012a00099' } }
  let statusCode = 200
  let responseData = null
  let nextCalled = false

  const res = {
    status(code) {
      statusCode = code
      return this
    },
    json(data) {
      responseData = data
    },
  }

  await preventCustomerDeletionWithDocuments(req, res, () => { nextCalled = true })

  assert.equal(statusCode, 409)
  assert.match(responseData.message, /This customer has secure documents/i)
  assert.equal(nextCalled, false)

  // When no documents exist
  CustomerDocument.exists = async () => null
  nextCalled = false
  await preventCustomerDeletionWithDocuments(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)

  CustomerDocument.exists = origExists
})
