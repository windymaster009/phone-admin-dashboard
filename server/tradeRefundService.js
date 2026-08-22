function refundError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function cleanText(value, maximum) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximum)
}

export function normalizeTradeRefundRequest(input, trade) {
  const reason = cleanText(input?.reason, 500)
  const confirmation = cleanText(input?.confirmation, 80)
  const inventoryDisposition = String(input?.inventoryDisposition || '').trim().toUpperCase()
  const externalReference = cleanText(input?.externalReference, 120)

  if (!trade || trade.type !== 'SELL') throw refundError(409, 'Only sale transactions can be refunded')
  if (trade.status !== 'COMPLETED') throw refundError(409, trade.status === 'RETURNED' ? 'This sale has already been refunded' : 'Only completed sales can be refunded')
  if (reason.length < 5) throw refundError(400, 'Enter a refund reason of at least 5 characters')
  if (confirmation !== trade.tradeNo) throw refundError(400, `Type ${trade.tradeNo} to confirm this refund`)
  if (!['RESTOCK', 'NO_RESTOCK'].includes(inventoryDisposition)) throw refundError(400, 'Choose whether returned items should be restored to available stock')
  if (trade.paymentMethod === 'KHQR' && externalReference.length < 4) {
    throw refundError(400, 'Complete the refund in ABA PayWay first, then enter its refund reference')
  }

  return {
    amount: Math.max(0, Number(trade.transactionAmountPaid ?? trade.amountPaid) || 0),
    reason,
    inventoryDisposition,
    externalReference: externalReference || undefined,
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
