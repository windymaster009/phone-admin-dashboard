import mongoose from 'mongoose'
import { CustomerDocument } from './documentModels.js'

export async function preventCustomerDeletionWithDocuments(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return next()
    const documentExists = await CustomerDocument.exists({ customer: req.params.id })
    if (documentExists) {
      return res.status(409).json({
        message: 'This customer has secure documents. Delete the documents first or deactivate the customer instead.',
      })
    }
    next()
  } catch (error) {
    next(error)
  }
}
