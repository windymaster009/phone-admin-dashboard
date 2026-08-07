import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  decryptDocument,
  documentSecurityStatus,
  encryptDocument,
  parseDocumentUpload,
} from './documentCrypto.js'

const previousKey = process.env.DOCUMENT_ENCRYPTION_KEY
const previousMaximum = process.env.DOCUMENT_MAX_BYTES

try {
  process.env.DOCUMENT_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  process.env.DOCUMENT_MAX_BYTES = String(5 * 1024 * 1024)

  const source = Buffer.from('%PDF-1.4\nPhoneFlow secure document test\n%%EOF')
  const parsed = parseDocumentUpload({
    fileData: `data:application/pdf;base64,${source.toString('base64')}`,
    originalName: 'customer-id.exe',
  })

  assert.equal(parsed.mimeType, 'application/pdf')
  assert.equal(parsed.originalName, 'customer-id.pdf')
  assert.equal(parsed.byteSize, source.length)
  assert.equal(documentSecurityStatus().configured, true)

  const encrypted = encryptDocument(parsed.buffer)
  const decrypted = decryptDocument(encrypted)
  assert.deepEqual(decrypted, source)
  assert.notDeepEqual(encrypted.encryptedData, source)

  const tampered = {
    ...encrypted,
    encryptedData: Buffer.from(encrypted.encryptedData),
  }
  tampered.encryptedData[0] ^= 0xff
  assert.throws(() => decryptDocument(tampered), /integrity check/)

  assert.throws(
    () => parseDocumentUpload({
      fileData: `data:image/png;base64,${source.toString('base64')}`,
      originalName: 'fake.png',
    }),
    /do not match/,
  )

  console.log('Secure document encryption self-check passed')
} finally {
  if (previousKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY
  else process.env.DOCUMENT_ENCRYPTION_KEY = previousKey
  if (previousMaximum === undefined) delete process.env.DOCUMENT_MAX_BYTES
  else process.env.DOCUMENT_MAX_BYTES = previousMaximum
}
