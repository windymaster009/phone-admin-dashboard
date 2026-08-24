import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import {
  decryptDocument,
  documentSecurityStatus,
  encodedFilename,
  encryptDocument,
  parseDocumentUpload,
} from './documentCrypto.js'
import { CustomerDocument, DocumentStorageUsage, customerDocumentCategories } from './documentModels.js'
import {
  applyDocumentNoStoreHeaders,
  assertDocumentCapacity,
  cleanDocumentMetadata,
  documentQuotaConfig,
  publicDocument,
} from './documentSecurity.js'
import { Customer, Pawn, Trade } from './models.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => (typeof value === 'string' ? value.trim() : value)
const documentRoles = allowRoles('OWNER', 'MANAGER', 'CASHIER')
const documentLimits = documentQuotaConfig()
const documentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: documentLimits.uploadRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  message: { message: 'Too many secure document uploads. Wait a few minutes and try again.' },
})

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

async function findCustomer(customerId) {
  if (!mongoose.isValidObjectId(customerId)) throw requestError(400, 'Customer ID is invalid')
  const customer = await Customer.findById(customerId).select('_id name active')
  if (!customer) throw requestError(404, 'Customer was not found')
  return customer
}

async function ensureStorageUsage() {
  const existing = await DocumentStorageUsage.findOne({ scope: 'SHOP' })
  if (existing) return existing

  const totals = await CustomerDocument.aggregate([
    { $group: { _id: null, documentCount: { $sum: 1 }, encryptedBytes: { $sum: '$byteSize' } } },
  ])
  try {
    return await DocumentStorageUsage.create({
      scope: 'SHOP',
      documentCount: totals[0]?.documentCount || 0,
      encryptedBytes: totals[0]?.encryptedBytes || 0,
    })
  } catch (error) {
    if (error?.code === 11000) return DocumentStorageUsage.findOne({ scope: 'SHOP' })
    throw error
  }
}

async function resolveRelatedRecord(customerId, rawReference) {
  const reference = clean(rawReference)?.toUpperCase()
  if (!reference) return { relatedType: 'CUSTOMER', relatedId: undefined, relatedReference: undefined }

  const pawn = await Pawn.findOne({ pawnNo: reference, customer: customerId }).select('_id pawnNo')
  if (pawn) return { relatedType: 'PAWN', relatedId: pawn._id, relatedReference: pawn.pawnNo }

  const trade = await Trade.findOne({ tradeNo: reference, customer: customerId }).select('_id tradeNo')
  if (trade) return { relatedType: 'TRADE', relatedId: trade._id, relatedReference: trade.tradeNo }

  throw requestError(404, 'No pawn or trade belonging to this customer matches that reference number')
}

router.use(applyDocumentNoStoreHeaders)

router.get('/status', requireAuth, documentRoles, (_req, res) => {
  res.json({ ...documentSecurityStatus(), ...documentQuotaConfig() })
})

router.get('/summary', requireAuth, documentRoles, asyncRoute(async (_req, res) => {
  const [totals, customersWithDocuments] = await Promise.all([
    CustomerDocument.aggregate([
      { $group: { _id: null, documentCount: { $sum: 1 }, encryptedBytes: { $sum: '$byteSize' } } },
    ]),
    CustomerDocument.distinct('customer'),
  ])

  res.json({
    documentCount: totals[0]?.documentCount || 0,
    encryptedBytes: totals[0]?.encryptedBytes || 0,
    customersWithDocuments: customersWithDocuments.length,
  })
}))

router.get('/customers/:customerId', requireAuth, documentRoles, asyncRoute(async (req, res) => {
  const customer = await findCustomer(req.params.customerId)
  const documents = await CustomerDocument.find({ customer: customer._id })
    .select('-encryptedData -iv -authTag')
    .populate('uploadedBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(100)

  res.json({ documents: documents.map(publicDocument) })
}))

router.post('/customers/:customerId', requireAuth, documentRoles, documentUploadLimiter, asyncRoute(async (req, res) => {
  const customer = await findCustomer(req.params.customerId)
  const category = clean(req.body.category)?.toUpperCase()
  if (!customerDocumentCategories.includes(category)) throw requestError(400, 'Document category is invalid')

  const upload = parseDocumentUpload({
    fileData: req.body.fileData,
    originalName: req.body.originalName,
  })
  const relatedReference = cleanDocumentMetadata(req.body.relatedReference, { label: 'Reference', maximumLength: 120 })
  const note = cleanDocumentMetadata(req.body.note, { label: 'Note', maximumLength: 500 })
  const related = await resolveRelatedRecord(customer._id, relatedReference)
  const encrypted = encryptDocument(upload.buffer)
  const quota = documentLimits
  await ensureStorageUsage()

  let document
  try {
    await mongoose.connection.transaction(async (session) => {
      const duplicate = await CustomerDocument.exists({
        customer: customer._id,
        category,
        sha256: upload.sha256,
      }).session(session)
      if (duplicate) throw requestError(409, 'This exact document is already stored for the customer')

      const customerTotals = await CustomerDocument.aggregate([
        { $match: { customer: customer._id } },
        { $group: { _id: null, documentCount: { $sum: 1 }, encryptedBytes: { $sum: '$byteSize' } } },
      ]).session(session)
      const usage = await DocumentStorageUsage.findOne({ scope: 'SHOP' }).session(session)
      if (!usage) throw requestError(503, 'Secure document storage usage is unavailable')

      assertDocumentCapacity({
        customerDocumentCount: customerTotals[0]?.documentCount || 0,
        customerBytes: customerTotals[0]?.encryptedBytes || 0,
        totalBytes: usage.encryptedBytes,
        totalDocumentCount: usage.documentCount,
        uploadBytes: upload.byteSize,
      }, quota)

      const reserved = await DocumentStorageUsage.findOneAndUpdate(
        {
          scope: 'SHOP',
          encryptedBytes: { $lte: quota.maximumTotalBytes - upload.byteSize },
          documentCount: { $lt: quota.maximumTotalDocuments },
        },
        { $inc: { encryptedBytes: upload.byteSize, documentCount: 1 } },
        { new: true, session },
      )
      if (!reserved) throw requestError(409, 'The shop secure document storage limit has been reached')

      const created = await CustomerDocument.create([{
        customer: customer._id,
        category,
        ...related,
        originalName: upload.originalName,
        mimeType: upload.mimeType,
        byteSize: upload.byteSize,
        sha256: upload.sha256,
        ...encrypted,
        note,
        uploadedBy: req.user._id,
      }], { session })
      document = created[0]

      await writeActivity(req, {
        action: 'UPLOAD',
        entity: 'CUSTOMER_DOCUMENT',
        entityId: document._id,
        details: {
          customerId: customer._id,
          category,
          mimeType: upload.mimeType,
          byteSize: upload.byteSize,
          relatedReference: related.relatedReference,
        },
      }, { required: true, session })
    })
  } catch (error) {
    if (error?.code === 11000) throw requestError(409, 'This exact document is already stored for the customer')
    throw error
  }

  await document.populate('uploadedBy', 'name role')

  res.status(201).json({ document: publicDocument(document) })
}))

router.get('/:id/file', requireAuth, documentRoles, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Document ID is invalid')
  const document = await CustomerDocument.findById(req.params.id)
    .select('+encryptedData +iv +authTag')
  if (!document) throw requestError(404, 'Secure document was not found')

  const data = decryptDocument(document)
  const disposition = req.query.download === '1' ? 'attachment' : 'inline'

  await writeActivity(req, {
    action: disposition === 'attachment' ? 'DOWNLOAD' : 'VIEW',
    entity: 'CUSTOMER_DOCUMENT',
    entityId: document._id,
    details: { customerId: document.customer, category: document.category },
  }, { required: true })

  res.setHeader('Content-Type', document.mimeType)
  res.setHeader('Content-Length', data.length)
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename(document.originalName)}`)
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Document-SHA256', document.sha256)
  res.send(data)
}))

router.delete('/:id', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Document ID is invalid')
  await ensureStorageUsage()
  let document
  await mongoose.connection.transaction(async (session) => {
    document = await CustomerDocument.findById(req.params.id).session(session)
    if (!document) throw requestError(404, 'Secure document was not found')

    await CustomerDocument.deleteOne({ _id: document._id }, { session })
    await DocumentStorageUsage.updateOne(
      { scope: 'SHOP' },
      { $inc: { encryptedBytes: -document.byteSize, documentCount: -1 } },
      { session },
    )

    await writeActivity(req, {
      action: 'DELETE',
      entity: 'CUSTOMER_DOCUMENT',
      entityId: document._id,
      details: {
        customerId: document.customer,
        category: document.category,
        byteSize: document.byteSize,
        relatedReference: document.relatedReference,
      },
    }, { required: true, session })
  })

  res.json({ deleted: true })
}))

export default router
