const DEFAULT_UPLOAD_BYTES = 5 * 1024 * 1024
const DEFAULT_CUSTOMER_BYTES = 100 * 1024 * 1024
const DEFAULT_TOTAL_BYTES = 500 * 1024 * 1024
const DEFAULT_CUSTOMER_DOCUMENTS = 100
const DEFAULT_TOTAL_DOCUMENTS = 5000

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return fallback
  return Math.floor(parsed)
}

export function documentQuotaConfig(env = process.env) {
  const maximumUploadBytes = boundedInteger(env.DOCUMENT_MAX_BYTES, DEFAULT_UPLOAD_BYTES, 1024, DEFAULT_UPLOAD_BYTES)
  const maximumCustomerBytes = boundedInteger(
    env.DOCUMENT_CUSTOMER_MAX_BYTES,
    DEFAULT_CUSTOMER_BYTES,
    maximumUploadBytes,
    2 * 1024 * 1024 * 1024,
  )
  const maximumTotalBytes = boundedInteger(
    env.DOCUMENT_TOTAL_MAX_BYTES,
    DEFAULT_TOTAL_BYTES,
    maximumCustomerBytes,
    10 * 1024 * 1024 * 1024,
  )
  const maximumCustomerDocuments = boundedInteger(
    env.DOCUMENT_CUSTOMER_MAX_COUNT,
    DEFAULT_CUSTOMER_DOCUMENTS,
    1,
    500,
  )
  const maximumTotalDocuments = boundedInteger(
    env.DOCUMENT_TOTAL_MAX_COUNT,
    DEFAULT_TOTAL_DOCUMENTS,
    maximumCustomerDocuments,
    50_000,
  )
  const uploadRateLimit = boundedInteger(env.DOCUMENT_UPLOAD_RATE_LIMIT, 12, 1, 100)

  return {
    maximumUploadBytes,
    maximumCustomerBytes,
    maximumTotalBytes,
    maximumCustomerDocuments,
    maximumTotalDocuments,
    uploadRateLimit,
  }
}

export function cleanDocumentMetadata(value, { label, maximumLength }) {
  if (value === undefined || value === null) return undefined
  const cleaned = String(value).normalize('NFKC').trim()
  if (!cleaned) return undefined
  if (cleaned.length > maximumLength) {
    const error = new Error(`${label} must be ${maximumLength} characters or fewer`)
    error.status = 400
    throw error
  }
  return cleaned
}

export function assertDocumentCapacity({
  customerDocumentCount,
  customerBytes,
  totalBytes,
  totalDocumentCount,
  uploadBytes,
}, config = documentQuotaConfig()) {
  if (customerDocumentCount >= config.maximumCustomerDocuments) {
    const error = new Error(`This customer already has the maximum of ${config.maximumCustomerDocuments} secure documents`)
    error.status = 409
    throw error
  }
  if (customerBytes + uploadBytes > config.maximumCustomerBytes) {
    const error = new Error('This customer has reached the secure document storage limit')
    error.status = 409
    throw error
  }
  if (totalBytes + uploadBytes > config.maximumTotalBytes) {
    const error = new Error('The shop secure document storage limit has been reached')
    error.status = 409
    throw error
  }
  if (totalDocumentCount >= config.maximumTotalDocuments) {
    const error = new Error('The shop secure document count limit has been reached')
    error.status = 409
    throw error
  }
}

export function publicDocument(document) {
  const item = document?.toObject ? document.toObject() : document || {}
  return {
    _id: item._id,
    category: item.category,
    relatedType: item.relatedType,
    relatedReference: item.relatedReference,
    originalName: item.originalName,
    mimeType: item.mimeType,
    byteSize: item.byteSize,
    note: item.note,
    uploadedBy: item.uploadedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function applyDocumentNoStoreHeaders(_req, res, next) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  next()
}
