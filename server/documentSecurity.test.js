import assert from 'node:assert/strict'
import test from 'node:test'
import { writeActivity } from './auth.js'
import { ActivityLog } from './models.js'
import {
  applyDocumentNoStoreHeaders,
  assertDocumentCapacity,
  cleanDocumentMetadata,
  documentQuotaConfig,
  publicDocument,
} from './documentSecurity.js'

test('secure document projection never exposes customer identity or encrypted fields', () => {
  const projected = publicDocument({
    _id: 'document-id',
    customer: { name: 'Customer', nationalIdNumber: '123456789' },
    category: 'CUSTOMER_PHOTO',
    originalName: 'photo.jpg',
    mimeType: 'image/jpeg',
    byteSize: 120,
    encryptedData: Buffer.from('ciphertext'),
    iv: Buffer.alloc(12),
    authTag: Buffer.alloc(16),
    sha256: 'private-hash',
  })

  assert.equal(projected.originalName, 'photo.jpg')
  assert.equal('customer' in projected, false)
  assert.equal('nationalIdNumber' in projected, false)
  assert.equal('encryptedData' in projected, false)
  assert.equal('sha256' in projected, false)
})

test('document metadata is normalized and length limited', () => {
  assert.equal(cleanDocumentMetadata('  PW-100  ', { label: 'Reference', maximumLength: 20 }), 'PW-100')
  assert.equal(cleanDocumentMetadata('   ', { label: 'Note', maximumLength: 20 }), undefined)
  assert.throws(
    () => cleanDocumentMetadata('x'.repeat(21), { label: 'Note', maximumLength: 20 }),
    /20 characters or fewer/,
  )
})

test('document quota rejects customer and shop overages while allowing valid uploads', () => {
  const config = documentQuotaConfig({
    DOCUMENT_MAX_BYTES: '1024',
    DOCUMENT_CUSTOMER_MAX_BYTES: '4096',
    DOCUMENT_TOTAL_MAX_BYTES: '10240',
    DOCUMENT_CUSTOMER_MAX_COUNT: '3',
    DOCUMENT_TOTAL_MAX_COUNT: '5',
  })

  assert.doesNotThrow(() => assertDocumentCapacity({
    customerDocumentCount: 1,
    customerBytes: 1000,
    totalBytes: 3000,
    totalDocumentCount: 2,
    uploadBytes: 1024,
  }, config))
  assert.throws(() => assertDocumentCapacity({
    customerDocumentCount: 3,
    customerBytes: 1000,
    totalBytes: 3000,
    totalDocumentCount: 2,
    uploadBytes: 1024,
  }, config), /maximum of 3/)
  assert.throws(() => assertDocumentCapacity({
    customerDocumentCount: 1,
    customerBytes: 3500,
    totalBytes: 3000,
    totalDocumentCount: 2,
    uploadBytes: 1024,
  }, config), /customer has reached/)
  assert.throws(() => assertDocumentCapacity({
    customerDocumentCount: 1,
    customerBytes: 1000,
    totalBytes: 9500,
    totalDocumentCount: 2,
    uploadBytes: 1024,
  }, config), /shop secure document storage limit/)
  assert.throws(() => assertDocumentCapacity({
    customerDocumentCount: 1,
    customerBytes: 1000,
    totalBytes: 3000,
    totalDocumentCount: 5,
    uploadBytes: 1024,
  }, config), /document count limit/)
})

test('document responses are marked no-store', () => {
  const headers = new Map()
  let continued = false
  applyDocumentNoStoreHeaders({}, { setHeader: (name, value) => headers.set(name, value) }, () => { continued = true })
  assert.equal(headers.get('Cache-Control'), 'private, no-store, max-age=0')
  assert.equal(headers.get('Pragma'), 'no-cache')
  assert.equal(headers.get('Expires'), '0')
  assert.equal(continued, true)
})

test('required secure activity logging fails closed', async () => {
  const originalSave = ActivityLog.prototype.save
  const originalConsoleError = console.error
  ActivityLog.prototype.save = async () => { throw new Error('audit unavailable') }
  console.error = () => {}
  const request = { user: { _id: '000000000000000000000001' }, ip: '127.0.0.1' }
  const event = { action: 'VIEW', entity: 'CUSTOMER_DOCUMENT', entityId: '000000000000000000000002' }

  try {
    await assert.rejects(() => writeActivity(request, event, { required: true }), /audit unavailable/)
    assert.equal(await writeActivity(request, event), null)
  } finally {
    ActivityLog.prototype.save = originalSave
    console.error = originalConsoleError
  }
})
