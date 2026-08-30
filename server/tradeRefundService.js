function refundError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function cleanText(value, maximum) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximum)
}

export function normalizeSaleWarrantyDays(value) {
  const days = Number(value)
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    throw refundError(400, 'Warranty days must be a whole number between 0 and 3650')
  }
  return days
}

export function saleWarrantyStatus(trade, now = new Date()) {
  if (trade?.warrantyDays === undefined || trade?.warrantyDays === null) {
    return { refundable: true, state: 'NOT_RECORDED', expiresAt: null }
  }

  const warrantyDays = Number(trade.warrantyDays)
  if (!Number.isInteger(warrantyDays) || warrantyDays <= 0) {
    return { refundable: false, state: 'NO_WARRANTY', expiresAt: null }
  }

  const savedExpiry = trade.warrantyExpiresAt ? new Date(trade.warrantyExpiresAt) : null
  const soldAt = trade.createdAt ? new Date(trade.createdAt) : null
  const derivedExpiry = soldAt && Number.isFinite(soldAt.getTime())
    ? new Date(soldAt.getTime() + warrantyDays * 86_400_000)
    : null
  const expiresAt = savedExpiry && Number.isFinite(savedExpiry.getTime()) ? savedExpiry : derivedExpiry
  if (!expiresAt) return { refundable: true, state: 'NOT_RECORDED', expiresAt: null }

  return {
    refundable: expiresAt.getTime() >= new Date(now).getTime(),
    state: expiresAt.getTime() >= new Date(now).getTime() ? 'ACTIVE' : 'EXPIRED',
    expiresAt,
  }
}

export function normalizeTradeRefundRequest(input, trade) {
  const reason = cleanText(input?.reason, 500)
  const confirmation = cleanText(input?.confirmation, 80)
  const inventoryDisposition = String(input?.inventoryDisposition || '').trim().toUpperCase()

  if (!trade || trade.type !== 'SELL') throw refundError(409, 'Only sale transactions can be refunded')
  if (trade.status !== 'COMPLETED') throw refundError(409, trade.status === 'RETURNED' ? 'This sale has already been refunded' : 'Only completed sales can be refunded')
  const warranty = saleWarrantyStatus(trade)
  if (warranty.state === 'NO_WARRANTY') throw refundError(409, 'This sale was recorded without a refund warranty')
  if (warranty.state === 'EXPIRED') throw refundError(409, `This sale's refund warranty expired on ${warranty.expiresAt.toISOString().slice(0, 10)}`)
  if (reason.length < 5) throw refundError(400, 'Enter a refund reason of at least 5 characters')
  if (confirmation !== trade.tradeNo) throw refundError(400, `Type ${trade.tradeNo} to confirm this refund`)
  if (!['RESTOCK', 'NO_RESTOCK'].includes(inventoryDisposition)) throw refundError(400, 'Choose whether returned items should be restored to available stock')

  return {
    amount: Math.max(0, Number(trade.transactionAmountPaid ?? trade.amountPaid) || 0),
    reason,
    inventoryDisposition,
  }
}

export function restoreReturnedInventory(inventoryItem, quantity) {
  const returnedQuantity = Number(quantity)
  if (!inventoryItem || !Number.isInteger(returnedQuantity) || returnedQuantity < 1) {
    throw refundError(409, 'A returned inventory line is invalid')
  }
  if (!['IN_STOCK', 'SOLD', 'ARCHIVED'].includes(inventoryItem.status)) {
    throw refundError(409, `${inventoryItem.name || 'A returned item'} is currently ${inventoryItem.status.toLowerCase().replaceAll('_', ' ')} and cannot be restocked automatically`)
  }
  if (inventoryItem.category === 'PHONE') {
    if (returnedQuantity !== 1 || inventoryItem.status !== 'SOLD' || Number(inventoryItem.quantity) !== 0) {
      throw refundError(409, `${inventoryItem.name || 'The returned phone'} no longer matches its sold inventory state`)
    }
    inventoryItem.quantity = 1
  } else {
    inventoryItem.quantity = Math.max(0, Number(inventoryItem.quantity) || 0) + returnedQuantity
  }
  inventoryItem.status = 'IN_STOCK'
  return inventoryItem
}
