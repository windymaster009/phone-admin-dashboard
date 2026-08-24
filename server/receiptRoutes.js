import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, requireAuth, writeActivity } from './auth.js'
import { Loan, LoanPayment } from './loanModels.js'
import { Pawn, Trade } from './models.js'
import { Receipt } from './receiptModels.js'
import { calculateDailyPawnSummary, calculatePawnFee, isDailyPawn } from './pawnFeeService.js'

const router = Router()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const clean = (value) => (typeof value === 'string' ? value.trim() : value)
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function requestError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function shopSnapshot() {
  return {
    name: clean(process.env.SHOP_NAME) || 'PhoneFlow',
    subtitle: clean(process.env.SHOP_SUBTITLE) || 'Phone Shop Management',
    phone: clean(process.env.SHOP_PHONE) || '',
    email: clean(process.env.SHOP_EMAIL) || '',
    address: clean(process.env.SHOP_ADDRESS) || '',
    taxId: clean(process.env.SHOP_TAX_ID) || '',
    logoUrl: clean(process.env.SHOP_LOGO_URL) || '',
    footer: clean(process.env.SHOP_RECEIPT_FOOTER) || 'Thank you for your business.',
  }
}

function receiptPrefix(documentType) {
  return {
    SALE_RECEIPT: 'SR',
    PURCHASE_RECEIPT: 'PR',
    REFUND_RECEIPT: 'RR',
    PAWN_CONTRACT: 'PC',
    PAWN_PAYMENT: 'PP',
    PAWN_REDEMPTION: 'RD',
    LOAN_AGREEMENT: 'LA',
    LOAN_PAYMENT: 'LP',
  }[documentType] || 'RC'
}

function makeReceiptNo(documentType) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${receiptPrefix(documentType)}-${date}-${random}`
}

function referenceQuery(value, numberField) {
  if (!value) throw requestError(400, 'Document reference is required')
  return mongoose.isValidObjectId(value)
    ? { $or: [{ _id: value }, { [numberField]: value.toUpperCase() }] }
    : { [numberField]: value.toUpperCase() }
}

async function findTrade(reference) {
  const value = clean(reference)
  const trade = await Trade.findOne(referenceQuery(value, 'tradeNo'))
    .populate('customer', 'name phone nationalIdNumber address')
    .populate('supplier', 'name phone nationalIdNumber')
    .populate('createdBy', 'name role')
    .populate('refund.refundedBy', 'name role')
    .populate('items.inventoryItem', 'sku barcode imei1 imei2 serialNumber brand model storage color')
  if (!trade) throw requestError(404, 'Transaction not found')
  return trade
}

async function findPawn(reference) {
  const value = clean(reference)
  const pawn = await Pawn.findOne(referenceQuery(value, 'pawnNo'))
    .populate('customer', 'name phone nationalIdNumber address')
    .populate('createdBy', 'name role')
    .populate('payments.receivedBy', 'name role')
    .populate('renewals.renewedBy', 'name role')
  if (!pawn) throw requestError(404, 'Pawn contract not found')
  return pawn
}

async function findLoan(reference) {
  const value = clean(reference)
  const loan = await Loan.findOne(referenceQuery(value, 'loanNo'))
    .populate('createdBy', 'name role')
    .populate('updatedBy', 'name role')
  if (!loan) throw requestError(404, 'Loan not found')
  const payments = await LoanPayment.find({ loan: loan._id })
    .sort({ paidAt: 1, createdAt: 1 })
    .populate('receivedBy', 'name role')
  return { loan, payments }
}

function tradeParty(trade) {
  if (trade.type === 'BUY') {
    return {
      name: trade.supplier?.name || trade.sellerSnapshot?.name || trade.customer?.name || 'Walk-in seller',
      phone: trade.supplier?.phone || trade.sellerSnapshot?.phone || trade.customer?.phone || '',
      nationalIdNumber: trade.supplier?.nationalIdNumber || trade.sellerSnapshot?.nationalIdNumber || trade.customer?.nationalIdNumber || '',
      address: trade.customer?.address || '',
      role: 'Seller',
    }
  }
  return {
    name: trade.customer?.name || 'Walk-in customer',
    phone: trade.customer?.phone || '',
    nationalIdNumber: trade.customer?.nationalIdNumber || '',
    address: trade.customer?.address || '',
    role: 'Customer',
  }
}

function tradeDisplayAmount(trade, original, converted) {
  return trade.currency === 'KHR' && original !== undefined && original !== null
    ? roundMoney(original)
    : roundMoney(converted)
}

function buildTradeSnapshot(trade, documentType) {
  const party = tradeParty(trade)
  const currency = trade.currency === 'KHR' ? 'KHR' : 'USD'
  const items = trade.items.map((line) => {
    const inventory = line.inventoryItem || {}
    const unitPrice = tradeDisplayAmount(trade, line.originalUnitPrice, line.unitPrice)
    return {
      name: line.name,
      quantity: Number(line.quantity || 1),
      unitPrice,
      total: roundMoney(unitPrice * Number(line.quantity || 1)),
      sku: inventory.sku || '',
      barcode: inventory.barcode || '',
      imei: inventory.imei1 || '',
      imei2: inventory.imei2 || '',
      serialNumber: inventory.serialNumber || '',
      description: [inventory.brand, inventory.model, inventory.storage, inventory.color].filter(Boolean).join(' '),
    }
  })
  const subtotal = tradeDisplayAmount(trade, trade.transactionSubtotal, trade.subtotal)
  const total = tradeDisplayAmount(trade, trade.transactionTotal, trade.total)
  const amountPaid = tradeDisplayAmount(trade, trade.transactionAmountPaid, trade.amountPaid)
  const balance = tradeDisplayAmount(trade, trade.transactionBalance, trade.balance)

  return {
    schemaVersion: 1,
    documentType,
    title: documentType === 'SALE_RECEIPT' ? 'Sales Receipt / Invoice' : 'Purchase Receipt',
    shop: shopSnapshot(),
    referenceNo: trade.tradeNo,
    issuedAt: trade.purchaseDate || trade.createdAt,
    originalTransactionAt: trade.createdAt,
    party,
    currency,
    exchangeRate: Number(trade.exchangeRate || 1),
    items,
    subtotal,
    discount: currency === 'KHR' ? roundMoney(Math.max(0, subtotal - total)) : roundMoney(trade.discount),
    total,
    amountPaid,
    balance,
    paymentMethod: trade.paymentMethod || 'OTHER',
    paymentStatus: trade.paymentStatus || (balance <= 0.005 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID'),
    transactionStatus: trade.status,
    notes: trade.notes || '',
    staff: trade.createdBy ? { name: trade.createdBy.name, role: trade.createdBy.role } : null,
    signatureLabels: documentType === 'SALE_RECEIPT'
      ? ['Customer signature', 'Cashier signature']
      : ['Seller signature', 'Shop representative'],
  }
}

function customerParty(customer, fallback = 'Unknown customer') {
  return {
    name: customer?.name || fallback,
    phone: customer?.phone || '',
    nationalIdNumber: customer?.nationalIdNumber || '',
    address: customer?.address || '',
    role: 'Customer',
  }
}

function pawnItem(pawn) {
  return {
    name: pawn.itemSnapshot?.name || 'Pawn collateral',
    quantity: 1,
    unitPrice: roundMoney(pawn.estimatedValue),
    total: roundMoney(pawn.estimatedValue),
    imei: pawn.itemSnapshot?.imei || '',
    description: [
      pawn.itemSnapshot?.brand,
      pawn.itemSnapshot?.model,
      pawn.itemSnapshot?.storage,
      pawn.itemSnapshot?.ram && `${pawn.itemSnapshot.ram} RAM`,
      pawn.itemSnapshot?.color,
      pawn.itemSnapshot?.condition,
    ].filter(Boolean).join(' '),
    accessories: Array.isArray(pawn.itemSnapshot?.accessoriesIncluded) ? pawn.itemSnapshot.accessoriesIncluded : [],
  }
}

const RECEIPT_DAY_MS = 24 * 60 * 60 * 1000

function pawnReceiptAmount(value, currency) {
  return currency === 'KHR' ? Math.round(Number(value || 0) / 100) * 100 : roundMoney(value)
}

function buildRefundSnapshot(trade) {
  if (trade.type !== 'SELL' || trade.status !== 'RETURNED' || !trade.refund) {
    throw requestError(409, 'A refund receipt is available only after a completed sale has been refunded')
  }

  const saleSnapshot = buildTradeSnapshot(trade, 'SALE_RECEIPT')
  const refundAmount = tradeDisplayAmount(trade, trade.refund.amount, trade.refund.amount)
  const inventoryNote = trade.refund.inventoryDisposition === 'RESTOCK'
    ? 'Returned items were restored to available stock.'
    : 'Returned items were not restored to saleable stock.'

  return {
    ...saleSnapshot,
    documentType: 'REFUND_RECEIPT',
    title: 'Refund Receipt',
    issuedAt: trade.refund.refundedAt || trade.updatedAt || new Date(),
    subtotal: undefined,
    discount: undefined,
    total: refundAmount,
    amountPaid: refundAmount,
    balance: 0,
    paymentStatus: 'REFUNDED',
    transactionStatus: 'RETURNED',
    notes: [`Refund reason: ${trade.refund.reason}`, inventoryNote].filter(Boolean).join('\n'),
    staff: trade.refund.refundedBy
      ? { name: trade.refund.refundedBy.name, role: trade.refund.refundedBy.role }
      : saleSnapshot.staff,
    signatureLabels: ['Customer acknowledgement', 'Shop representative'],
  }
}

function daysBetween(fromValue, toValue, fallback = 0) {
  const from = new Date(fromValue)
  const to = new Date(toValue)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Math.max(0, Number(fallback) || 0)
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / RECEIPT_DAY_MS))
}

function graceEndForTicket(dueDate, gracePeriodDays) {
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return dueDate
  return new Date(due.getTime() + Math.max(0, Number(gracePeriodDays) || 0) * RECEIPT_DAY_MS)
}

function pawnContractRevisions(pawn) {
  const renewals = Array.from(pawn.renewals || [])
  return [
    { sourceSubId: 'contract', renewal: null, part: 1 },
    ...renewals.map((renewal, index) => ({
      sourceSubId: `renewal:${renewal._id}`,
      renewal,
      part: Number(renewal.ticketPart) || index + 2,
    })),
  ]
}

function findPawnContractRevision(pawn, requestedSubId) {
  const revisions = pawnContractRevisions(pawn)
  if (!requestedSubId || requestedSubId === 'latest-contract') return revisions.at(-1)
  const revision = revisions.find((entry) => entry.sourceSubId === requestedSubId)
  if (!revision) throw requestError(404, 'This pawn ticket revision was not found')
  return revision
}

function buildPawnContractSnapshot(pawn, revision = findPawnContractRevision(pawn, 'contract')) {
  const currency = pawn.currency === 'KHR' ? 'KHR' : 'USD'
  const renewals = Array.from(pawn.renewals || [])
  const renewal = revision.renewal
  const initialDueDate = renewals[0]?.previousDueDate || pawn.dueDate
  const dueDate = renewal?.newDueDate || initialDueDate
  const issuedAt = renewal?.renewedAt || pawn.issueDate || pawn.createdAt
  const termDays = Number(renewal?.termDays) || daysBetween(
    pawn.startDate || pawn.issueDate || pawn.createdAt,
    initialDueDate,
    pawn.termDays,
  )
  const contractLengthDays = Number(renewal?.contractLengthDays) || daysBetween(
    pawn.startDate || pawn.issueDate || pawn.createdAt,
    dueDate,
    termDays,
  )
  const principal = pawnReceiptAmount(
    renewal?.principalRemaining ?? pawn.originalPrincipal ?? pawn.principal,
    currency,
  )
  const dailyFeeRate = Number.isFinite(Number(renewal?.dailyFeeRate))
    ? Number(renewal.dailyFeeRate)
    : Number(pawn.dailyFeeRate || 0)
  const dailyFeeAmount = Number.isFinite(Number(renewal?.dailyFeeAmount))
    ? pawnReceiptAmount(renewal.dailyFeeAmount, currency)
    : calculatePawnFee(principal, 1, currency, dailyFeeRate)
  const pawnFeeAtDue = pawnReceiptAmount(dailyFeeAmount * termDays, currency)
  const dailySummary = isDailyPawn(pawn) ? calculateDailyPawnSummary(pawn, dueDate) : null
  return {
    schemaVersion: 1,
    documentType: 'PAWN_CONTRACT',
    title: `Pawn Contract - Part ${revision.part}`,
    shop: shopSnapshot(),
    referenceNo: pawn.pawnNo,
    issuedAt,
    party: customerParty(pawn.customer),
    currency,
    exchangeRate: Number(pawn.exchangeRate || 1),
    items: [pawnItem(pawn)],
    estimatedValue: roundMoney(pawn.estimatedValue),
    pawnPercentage: Number(pawn.pawnPercentage || 0),
    principal,
    total: isDailyPawn(pawn) ? pawnReceiptAmount(principal + pawnFeeAtDue, currency) : roundMoney(pawn.originalPrincipal ?? pawn.principal),
    amountPaid: 0,
    balance: roundMoney(pawn.remainingPrincipal ?? pawn.principal),
    interestRate: Number(pawn.interestRate || 0),
    interestPeriod: pawn.interestPeriod || 'MONTHLY',
    feeModel: pawn.feeModel || 'LEGACY_MONTHLY',
    dailyFeeRate,
    dailyFeeAmount,
    termDays,
    contractLengthDays,
    extensionTermDays: renewal ? termDays : undefined,
    ticketPart: revision.part,
    previousDueDate: renewal?.previousDueDate,
    startDate: pawn.startDate || pawn.issueDate || pawn.createdAt,
    pawnFeeAtDue: isDailyPawn(pawn) ? pawnFeeAtDue : dailySummary?.feeAtDueDate,
    dueDate,
    graceEndsAt: graceEndForTicket(dueDate, pawn.gracePeriodDays),
    identificationVerified: Boolean(pawn.identificationVerified),
    ownershipConfirmed: Boolean(pawn.ownershipConfirmed || pawn.identificationVerified),
    status: pawn.status,
    notes: pawn.notes || '',
    staff: pawn.createdBy ? { name: pawn.createdBy.name, role: pawn.createdBy.role } : null,
    signatureLabels: ['Customer signature / thumbprint', 'Shop representative'],
  }
}

function findPawnPayment(pawn, sourceSubId, documentType) {
  const payments = Array.from(pawn.payments || [])
  let payment
  if (sourceSubId && sourceSubId !== 'latest') {
    payment = payments.find((entry) => entry._id?.toString() === sourceSubId)
  }
  if (!payment && documentType === 'PAWN_REDEMPTION') {
    payment = [...payments].reverse().find((entry) => entry.type === 'REDEMPTION')
  }
  if (!payment) payment = payments.at(-1)
  if (!payment) throw requestError(404, 'This pawn contract does not have a payment to receipt')
  if (documentType === 'PAWN_REDEMPTION' && payment.type !== 'REDEMPTION') {
    throw requestError(409, 'A redemption payment has not been recorded for this pawn')
  }
  return payment
}

function buildPawnPaymentSnapshot(pawn, payment, documentType) {
  const isRedemption = documentType === 'PAWN_REDEMPTION'
  return {
    schemaVersion: 1,
    documentType,
    title: isRedemption ? 'Pawn Redemption Receipt' : 'Pawn Payment Receipt',
    shop: shopSnapshot(),
    referenceNo: pawn.pawnNo,
    paymentReference: payment._id.toString(),
    issuedAt: payment.paidAt || pawn.updatedAt || new Date(),
    party: customerParty(pawn.customer),
    currency: pawn.currency === 'KHR' ? 'KHR' : 'USD',
    exchangeRate: Number(pawn.exchangeRate || 1),
    items: [pawnItem(pawn)],
    paymentType: payment.type,
    paymentMethod: 'NOT_RECORDED',
    total: roundMoney(payment.amount),
    amountPaid: roundMoney(payment.amount),
    balance: roundMoney(payment.balanceAfter),
    allocation: {
      principal: roundMoney(payment.principalApplied),
      interest: roundMoney(payment.interestApplied),
      fees: roundMoney((payment.feesApplied || 0) + (payment.pawnFeeApplied || 0)),
      pawnFee: roundMoney(payment.pawnFeeApplied),
      additionalCollected: roundMoney(payment.additionalCollected),
    },
    contractPrincipal: roundMoney(pawn.originalPrincipal ?? pawn.principal),
    dueDate: pawn.dueDate,
    status: pawn.status,
    notes: payment.note || '',
    staff: payment.receivedBy ? { name: payment.receivedBy.name, role: payment.receivedBy.role } : null,
    signatureLabels: isRedemption
      ? ['Customer confirms collateral received', 'Cashier signature']
      : ['Customer signature', 'Cashier signature'],
  }
}

function loanParty(loan) {
  return {
    name: loan.borrower?.name || 'Unknown borrower',
    phone: loan.borrower?.phone || '',
    nationalIdNumber: loan.borrower?.nationalIdNumber || '',
    address: loan.borrower?.address || '',
    role: 'Borrower',
  }
}

function buildLoanAgreementSnapshot(loan) {
  return {
    schemaVersion: 1,
    documentType: 'LOAN_AGREEMENT',
    title: 'Loan Agreement',
    shop: shopSnapshot(),
    referenceNo: loan.loanNo,
    issuedAt: loan.loanDate || loan.createdAt,
    party: loanParty(loan),
    currency: loan.currency === 'KHR' ? 'KHR' : 'USD',
    items: [{
      name: loan.reason || 'Money loan',
      quantity: 1,
      unitPrice: roundMoney(loan.principal),
      total: roundMoney(loan.principal),
      description: loan.notes || '',
    }],
    principal: roundMoney(loan.principal),
    interestType: loan.interestType,
    interestValue: roundMoney(loan.interestValue),
    interestAmount: roundMoney(loan.interestAmount),
    total: roundMoney(loan.totalDue),
    amountPaid: roundMoney(loan.amountPaid),
    balance: roundMoney(loan.remainingBalance),
    dueDate: loan.dueDate,
    status: loan.status,
    notes: loan.notes || '',
    staff: loan.createdBy ? { name: loan.createdBy.name, role: loan.createdBy.role } : null,
    signatureLabels: ['Borrower signature / thumbprint', 'Lender signature'],
  }
}

function findLoanPayment(payments, sourceSubId) {
  let payment
  if (sourceSubId && sourceSubId !== 'latest') {
    payment = payments.find((entry) => entry._id.toString() === sourceSubId)
  }
  if (!payment) payment = payments.at(-1)
  if (!payment) throw requestError(404, 'This loan does not have a repayment to receipt')
  return payment
}

function buildLoanPaymentSnapshot(loan, payments, payment) {
  let cumulativePaid = 0
  for (const entry of payments) {
    cumulativePaid = roundMoney(cumulativePaid + Number(entry.amount || 0))
    if (entry._id.toString() === payment._id.toString()) break
  }
  const balanceAfter = roundMoney(Math.max(0, Number(loan.totalDue || 0) - cumulativePaid))
  return {
    schemaVersion: 1,
    documentType: 'LOAN_PAYMENT',
    title: 'Loan Repayment Receipt',
    shop: shopSnapshot(),
    referenceNo: loan.loanNo,
    paymentReference: payment.paymentNo,
    issuedAt: payment.paidAt || payment.createdAt,
    party: loanParty(loan),
    currency: loan.currency === 'KHR' ? 'KHR' : 'USD',
    items: [{
      name: 'Loan repayment',
      quantity: 1,
      unitPrice: roundMoney(payment.amount),
      total: roundMoney(payment.amount),
      description: loan.reason || '',
    }],
    paymentType: 'LOAN_REPAYMENT',
    paymentMethod: payment.paymentMethod,
    total: roundMoney(payment.amount),
    amountPaid: roundMoney(payment.amount),
    balance: balanceAfter,
    contractPrincipal: roundMoney(loan.principal),
    contractTotal: roundMoney(loan.totalDue),
    dueDate: loan.dueDate,
    status: balanceAfter <= 0.005 ? 'PAID' : loan.status,
    notes: payment.note || '',
    paymentExternalReference: payment.reference || '',
    staff: payment.receivedBy ? { name: payment.receivedBy.name, role: payment.receivedBy.role } : null,
    signatureLabels: ['Borrower signature', 'Cashier signature'],
  }
}

async function createOrGetReceipt(req, data) {
  const key = {
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    documentType: data.documentType,
    sourceSubId: data.sourceSubId,
  }
  const existing = await Receipt.findOne(key).populate('createdBy lastPrintedBy', 'name role')
  if (existing) return { receipt: existing, created: false }

  try {
    const receipt = await Receipt.create({
      ...data,
      receiptNo: makeReceiptNo(data.documentType),
      createdBy: req.user._id,
    })
    await writeActivity(req, {
      action: 'CREATE',
      entity: 'RECEIPT',
      entityId: receipt._id,
      details: {
        receiptNo: receipt.receiptNo,
        documentType: receipt.documentType,
        referenceNo: receipt.referenceNo,
        total: receipt.total,
        currency: receipt.currency,
      },
    })
    return { receipt: await receipt.populate('createdBy lastPrintedBy', 'name role'), created: true }
  } catch (error) {
    if (error?.code !== 11000) throw error
    const receipt = await Receipt.findOne(key).populate('createdBy lastPrintedBy', 'name role')
    if (!receipt) throw error
    return { receipt, created: false }
  }
}

function option(documentType, sourceSubId, label, issuedAt, amount, currency) {
  return { documentType, sourceSubId, label, issuedAt, amount: roundMoney(amount), currency }
}

router.get('/options', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const sourceType = String(req.query.sourceType || '').toUpperCase()
  const reference = clean(req.query.reference)

  if (sourceType === 'TRADE') {
    const trade = await findTrade(reference)
    const documentType = trade.type === 'SELL' ? 'SALE_RECEIPT' : 'PURCHASE_RECEIPT'
    const options = [option(
      documentType,
      'trade',
      documentType === 'SALE_RECEIPT' ? 'Sales receipt / invoice' : 'Purchase receipt',
      trade.purchaseDate || trade.createdAt,
      tradeDisplayAmount(trade, trade.transactionTotal, trade.total),
      trade.currency === 'KHR' ? 'KHR' : 'USD',
    )]
    if (trade.type === 'SELL' && trade.status === 'RETURNED' && trade.refund) {
      options.push(option(
        'REFUND_RECEIPT',
        'refund',
        'Refund receipt',
        trade.refund.refundedAt || trade.updatedAt || trade.createdAt,
        tradeDisplayAmount(trade, trade.refund.amount, trade.refund.amount),
        trade.currency === 'KHR' ? 'KHR' : 'USD',
      ))
    }
    return res.json({
      sourceType,
      referenceNo: trade.tradeNo,
      options,
    })
  }

  if (sourceType === 'PAWN') {
    const pawn = await findPawn(reference)
    const currency = pawn.currency === 'KHR' ? 'KHR' : 'USD'
    const payments = Array.from(pawn.payments || []).slice().reverse().map((payment) => option(
      payment.type === 'REDEMPTION' ? 'PAWN_REDEMPTION' : 'PAWN_PAYMENT',
      payment._id.toString(),
      payment.type === 'REDEMPTION'
        ? 'Redemption receipt'
        : `${String(payment.type).replaceAll('_', ' ').toLowerCase()} payment receipt`,
      payment.paidAt,
      payment.amount,
      currency,
    ))
    const contractRevisions = pawnContractRevisions(pawn).slice().reverse().map((revision) => option(
      'PAWN_CONTRACT',
      revision.sourceSubId,
      `Pawn contract - Part ${revision.part}`,
      revision.renewal?.renewedAt || pawn.issueDate || pawn.createdAt,
      revision.renewal?.principalRemaining ?? pawn.originalPrincipal ?? pawn.principal,
      currency,
    ))
    return res.json({
      sourceType,
      referenceNo: pawn.pawnNo,
      options: [...contractRevisions, ...payments],
    })
  }

  if (sourceType === 'LOAN') {
    const { loan, payments } = await findLoan(reference)
    const currency = loan.currency === 'KHR' ? 'KHR' : 'USD'
    return res.json({
      sourceType,
      referenceNo: loan.loanNo,
      options: [option(
        'LOAN_AGREEMENT',
        'agreement',
        'Loan agreement',
        loan.loanDate || loan.createdAt,
        loan.totalDue,
        currency,
      ), ...payments.slice().reverse().map((payment) => option(
        'LOAN_PAYMENT',
        payment._id.toString(),
        'Loan repayment receipt',
        payment.paidAt,
        payment.amount,
        currency,
      ))],
    })
  }

  throw requestError(400, 'Source type must be TRADE, PAWN, or LOAN')
}))

router.post('/generate', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const sourceType = String(req.body.sourceType || '').toUpperCase()
  const reference = clean(req.body.reference)
  const requestedType = String(req.body.documentType || '').toUpperCase()
  const requestedSubId = clean(req.body.sourceSubId)

  let source
  let documentType
  let sourceSubId
  let snapshot

  if (sourceType === 'TRADE') {
    source = await findTrade(reference)
    const tradeDocumentType = source.type === 'SELL' ? 'SALE_RECEIPT' : 'PURCHASE_RECEIPT'
    documentType = requestedType || tradeDocumentType
    if (documentType === 'REFUND_RECEIPT') {
      sourceSubId = 'refund'
      snapshot = buildRefundSnapshot(source)
    } else {
      if (documentType !== tradeDocumentType) throw requestError(409, 'Receipt type does not match this transaction')
      sourceSubId = 'trade'
      snapshot = buildTradeSnapshot(source, documentType)
    }
  } else if (sourceType === 'PAWN') {
    source = await findPawn(reference)
    documentType = requestedType || 'PAWN_CONTRACT'
    if (!['PAWN_CONTRACT', 'PAWN_PAYMENT', 'PAWN_REDEMPTION'].includes(documentType)) {
      throw requestError(400, 'Invalid pawn receipt type')
    }
    const revision = documentType === 'PAWN_CONTRACT' ? findPawnContractRevision(source, requestedSubId) : null
    const payment = documentType === 'PAWN_CONTRACT' ? null : findPawnPayment(source, requestedSubId, documentType)
    sourceSubId = payment ? payment._id.toString() : revision.sourceSubId
    snapshot = payment ? buildPawnPaymentSnapshot(source, payment, documentType) : buildPawnContractSnapshot(source, revision)
  } else if (sourceType === 'LOAN') {
    const result = await findLoan(reference)
    source = result.loan
    documentType = requestedType || 'LOAN_AGREEMENT'
    if (!['LOAN_AGREEMENT', 'LOAN_PAYMENT'].includes(documentType)) throw requestError(400, 'Invalid loan receipt type')
    const payment = documentType === 'LOAN_AGREEMENT' ? null : findLoanPayment(result.payments, requestedSubId)
    sourceSubId = payment ? payment._id.toString() : 'agreement'
    snapshot = payment ? buildLoanPaymentSnapshot(source, result.payments, payment) : buildLoanAgreementSnapshot(source)
  } else {
    throw requestError(400, 'Source type must be TRADE, PAWN, or LOAN')
  }

  const party = snapshot.party
  const result = await createOrGetReceipt(req, {
    documentType,
    sourceType,
    sourceId: source._id,
    sourceSubId,
    referenceNo: snapshot.referenceNo,
    partyName: party.name,
    partyPhone: party.phone,
    currency: snapshot.currency,
    total: snapshot.total,
    issuedAt: snapshot.issuedAt,
    snapshot,
  })
  res.status(result.created ? 201 : 200).json(result)
}))

router.get('/', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const query = {}
  const search = clean(req.query.search)
  const documentType = String(req.query.documentType || '').toUpperCase()
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i')
    query.$or = [
      { receiptNo: regex },
      { referenceNo: regex },
      { partyName: regex },
      { partyPhone: regex },
    ]
  }
  if (documentType && documentType !== 'ALL') query.documentType = documentType
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 250))
  const receipts = await Receipt.find(query)
    .sort({ issuedAt: -1, createdAt: -1 })
    .limit(limit)
    .populate('createdBy lastPrintedBy', 'name role')
    .select('-snapshot')
  res.json({ receipts })
}))

router.get('/:id', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const receipt = await Receipt.findById(req.params.id).populate('createdBy lastPrintedBy', 'name role')
  if (!receipt) throw requestError(404, 'Receipt not found')
  res.json({ receipt })
}))

router.post('/:id/printed', requireAuth, allowRoles('OWNER', 'MANAGER', 'CASHIER'), asyncRoute(async (req, res) => {
  const current = await Receipt.findById(req.params.id).select('printCount')
  if (!current) throw requestError(404, 'Receipt not found')
  const now = new Date()
  const firstPrint = Number(current.printCount || 0) === 0
  const receipt = await Receipt.findByIdAndUpdate(
    current._id,
    {
      $inc: { printCount: 1 },
      $set: {
        lastPrintedAt: now,
        lastPrintedBy: req.user._id,
        ...(firstPrint ? { firstPrintedAt: now } : {}),
      },
    },
    { new: true },
  ).populate('createdBy lastPrintedBy', 'name role')

  await writeActivity(req, {
    action: receipt.printCount > 1 ? 'REPRINT' : 'PRINT',
    entity: 'RECEIPT',
    entityId: receipt._id,
    details: {
      receiptNo: receipt.receiptNo,
      documentType: receipt.documentType,
      referenceNo: receipt.referenceNo,
      printCount: receipt.printCount,
      layout: clean(req.body.layout) || 'A4',
    },
  })
  res.json({ receipt })
}))

export default router
