import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import {
  decryptDocument,
  documentSecurityStatus,
  encodedFilename,
  encryptDocument,
  parseDocumentUpload,
} from './documentCrypto.js'
import { CustomerDocument, customerDocumentCategories } from './documentModels.js'
import { Customer, Pawn, Trade } from './models.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const clean = (value) => (typeof value === 'string' ? value.trim() : value)
const documentRoles = allowRoles('OWNER', 'MANAGER', 'CASHIER')

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function publicDocument(document) {
  const item = document.toObject ? document.toObject() : document
  return {
    _id: item._id,
    customer: item.customer,
    category: item.category,
    relatedType: item.relatedType,
    relatedId: item.relatedId,
    relatedReference: item.relatedReference,
    originalName: item.originalName,
    mimeType: item.mimeType,
    byteSize: item.byteSize,
    sha256: item.sha256,
    note: item.note,
    uploadedBy: item.uploadedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

async function findCustomer(customerId) {
  if (!mongoose.isValidObjectId(customerId)) throw requestError(400, 'Customer ID is invalid')
  const customer = await Customer.findById(customerId).select('name phone nationalIdNumber active')
  if (!customer) throw requestError(404, 'Customer was not found')
  return customer
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

router.get('/status', requireAuth, documentRoles, (_req, res) => {
  res.json(documentSecurityStatus())
})

router.get('/summary', requireAuth, documentRoles, asyncRoute(async (_req, res) => {
  const [totals, customersWithDocuments, recent] = await Promise.all([
    CustomerDocument.aggregate([
      { $group: { _id: null, documentCount: { $sum: 1 }, encryptedBytes: { $sum: '$byteSize' } } },
    ]),
    CustomerDocument.distinct('customer'),
    CustomerDocument.find()
      .select('-encryptedData -iv -authTag')
      .populate('customer', 'name phone')
      .populate('uploadedBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(8),
  ])

  res.json({
    documentCount: totals[0]?.documentCount || 0,
    encryptedBytes: totals[0]?.encryptedBytes || 0,
    customersWithDocuments: customersWithDocuments.length,
    recent: recent.map(publicDocument),
  })
}))

router.get('/customers/:customerId', requireAuth, documentRoles, asyncRoute(async (req, res) => {
  const customer = await findCustomer(req.params.customerId)
  const documents = await CustomerDocument.find({ customer: customer._id })
    .select('-encryptedData -iv -authTag')
    .populate('uploadedBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(100)

  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ customer, documents: documents.map(publicDocument) })
}))

router.post('/customers/:customerId', requireAuth, documentRoles, asyncRoute(async (req, res) => {
  const customer = await findCustomer(req.params.customerId)
  const category = clean(req.body.category)?.toUpperCase()
  if (!customerDocumentCategories.includes(category)) throw requestError(400, 'Document category is invalid')

  const currentCount = await CustomerDocument.countDocuments({ customer: customer._id })
  if (currentCount >= 100) throw requestError(409, 'This customer already has the maximum of 100 secure documents')

  const upload = parseDocumentUpload({
    fileData: req.body.fileData,
    originalName: req.body.originalName,
  })
  const duplicate = await CustomerDocument.exists({
    customer: customer._id,
    category,
    sha256: upload.sha256,
  })
  if (duplicate) throw requestError(409, 'This exact document is already stored for the customer')

  const related = await resolveRelatedRecord(customer._id, req.body.relatedReference)
  const encrypted = encryptDocument(upload.buffer)
  const document = await CustomerDocument.create({
    customer: customer._id,
    category,
    ...related,
    originalName: upload.originalName,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    sha256: upload.sha256,
    ...encrypted,
    note: clean(req.body.note),
    uploadedBy: req.user._id,
  })
  await document.populate('uploadedBy', 'name role')

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
  })

  res.status(201).json({ document: publicDocument(document) })
}))

router.get('/:id/file', requireAuth, documentRoles, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Document ID is invalid')
  const document = await CustomerDocument.findById(req.params.id)
    .select('+encryptedData +iv +authTag')
  if (!document) throw requestError(404, 'Secure document was not found')

  const data = decryptDocument(document)
  const disposition = req.query.download === '1' ? 'attachment' : 'inline'

  res.setHeader('Content-Type', document.mimeType)
  res.setHeader('Content-Length', data.length)
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodedFilename(document.originalName)}`)
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Document-SHA256', document.sha256)
  res.send(data)

  void writeActivity(req, {
    action: disposition === 'attachment' ? 'DOWNLOAD' : 'VIEW',
    entity: 'CUSTOMER_DOCUMENT',
    entityId: document._id,
    details: { customerId: document.customer, category: document.category },
  })
}))

router.delete('/:id', requireAuth, allowRoles('OWNER', 'MANAGER'), asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw requestError(400, 'Document ID is invalid')
  const document = await CustomerDocument.findByIdAndDelete(req.params.id)
  if (!document) throw requestError(404, 'Secure document was not found')

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
  })

  res.json({ deleted: true })
}))

export default router
