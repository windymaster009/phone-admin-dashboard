import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function configuredMaximumBytes() {
  const parsed = Number(process.env.DOCUMENT_MAX_BYTES || 5 * 1024 * 1024)
  if (!Number.isFinite(parsed) || parsed < 1024 || parsed > 10 * 1024 * 1024) return 5 * 1024 * 1024
  return Math.floor(parsed)
}

function parseKey() {
  const raw = String(process.env.DOCUMENT_ENCRYPTION_KEY || '').trim()
  if (!raw) return null

  let key
  if (/^[a-fA-F0-9]{64}$/.test(raw)) key = Buffer.from(raw, 'hex')
  else {
    try {
      key = Buffer.from(raw, 'base64')
    } catch {
      key = null
    }
  }

  return key?.length === 32 ? key : null
}

function detectMimeType(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return 'image/png'
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  return null
}

function sanitizeFilename(value, mimeType) {
  const fallbackExtensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  }
  const cleaned = String(value || 'document')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  const safe = cleaned || `document${fallbackExtensions[mimeType]}`
  return /\.[a-zA-Z0-9]{2,5}$/.test(safe) ? safe : `${safe}${fallbackExtensions[mimeType]}`
}

export function documentSecurityStatus() {
  const key = parseKey()
  return {
    configured: Boolean(key),
    keyId: key ? createHash('sha256').update(key).digest('hex').slice(0, 16) : null,
    maximumBytes: configuredMaximumBytes(),
    allowedMimeTypes: [...allowedMimeTypes],
  }
}

export function parseDocumentUpload({ fileData, originalName }) {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/.exec(String(fileData || ''))
  if (!match || !allowedMimeTypes.has(match[1])) {
    throw requestError(400, 'Upload a JPEG, PNG, WebP, or PDF document')
  }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0) throw requestError(400, 'The uploaded document is empty')
  if (buffer.length > configuredMaximumBytes()) {
    throw requestError(400, `Document must be ${Math.floor(configuredMaximumBytes() / 1024 / 1024)}MB or smaller`)
  }

  const detectedMimeType = detectMimeType(buffer)
  if (!detectedMimeType || detectedMimeType !== match[1]) {
    throw requestError(400, 'The document contents do not match the declared file type')
  }

  return {
    buffer,
    mimeType: detectedMimeType,
    originalName: sanitizeFilename(originalName, detectedMimeType),
    byteSize: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
}

export function encryptDocument(buffer) {
  const key = parseKey()
  if (!key) {
    throw requestError(
      503,
      'Secure document storage is not configured. Set DOCUMENT_ENCRYPTION_KEY to a 32-byte base64 value or 64 hexadecimal characters.',
    )
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encryptedData = Buffer.concat([cipher.update(buffer), cipher.final()])
  const authTag = cipher.getAuthTag()
  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 16)

  return { encryptedData, iv, authTag, keyId, encryptionVersion: 1 }
}

export function decryptDocument(document) {
  const key = parseKey()
  if (!key) throw requestError(503, 'Secure document storage is not configured on this server')

  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 16)
  if (document.keyId !== keyId) {
    throw requestError(503, 'The configured document encryption key does not match this file')
  }
  if (document.encryptionVersion !== 1) throw requestError(500, 'Unsupported document encryption version')

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(document.iv))
    decipher.setAuthTag(Buffer.from(document.authTag))
    return Buffer.concat([
      decipher.update(Buffer.from(document.encryptedData)),
      decipher.final(),
    ])
  } catch {
    throw requestError(500, 'The encrypted document failed its integrity check')
  }
}

export function encodedFilename(value) {
  return encodeURIComponent(String(value || 'document').replace(/[\r\n]/g, ''))
}
