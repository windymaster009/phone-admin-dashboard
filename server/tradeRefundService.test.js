import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTradeRefundRequest, restoreReturnedInventory } from './tradeRefundService.js'

const sale = {
  tradeNo: 'SL-20260822-TEST',
  type: 'SELL',
  status: 'COMPLETED',
  paymentMethod: 'CASH',
  transactionAmountPaid: 25,
  amountPaid: 25,
}

test('normalizes an explicitly confirmed full cash refund', () => {
  assert.deepEqual(normalizeTradeRefundRequest({
    reason: '  Customer returned item  ',
    confirmation: sale.tradeNo,
    inventoryDisposition: 'restock',
  }, sale), {
    amount: 25,
    reason: 'Customer returned item',
    inventoryDisposition: 'RESTOCK',
  })
})

test('rejects a repeated refund', () => {
  assert.throws(
    () => normalizeTradeRefundRequest({ reason: 'Returned item', confirmation: sale.tradeNo, inventoryDisposition: 'RESTOCK' }, { ...sale, status: 'RETURNED' }),
    /already been refunded/,
  )
})

test('uses the same record-only refund rules for a historical non-cash sale', () => {
  assert.deepEqual(normalizeTradeRefundRequest({
    reason: 'Customer returned item',
    confirmation: sale.tradeNo,
    inventoryDisposition: 'NO_RESTOCK',
  }, { ...sale, paymentMethod: 'KHQR' }), {
    amount: 25,
    reason: 'Customer returned item',
    inventoryDisposition: 'NO_RESTOCK',
  })
})

test('restores serialized and quantity-based inventory safely', () => {
  const phone = { name: 'Phone', category: 'PHONE', quantity: 0, status: 'SOLD' }
  const accessory = { name: 'Cable', category: 'ACCESSORY', quantity: 4, status: 'IN_STOCK' }
  restoreReturnedInventory(phone, 1)
  restoreReturnedInventory(accessory, 3)
  assert.deepEqual(phone, { name: 'Phone', category: 'PHONE', quantity: 1, status: 'IN_STOCK' })
  assert.deepEqual(accessory, { name: 'Cable', category: 'ACCESSORY', quantity: 7, status: 'IN_STOCK' })
})

test('does not overwrite a serialized item that changed after its sale', () => {
  assert.throws(
    () => restoreReturnedInventory({ name: 'Phone', category: 'PHONE', quantity: 1, status: 'IN_STOCK' }, 1),
    /no longer matches/,
  )
})
